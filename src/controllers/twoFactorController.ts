import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import User from '../models/User';
import TwoFactorSession from '../models/TwoFactorSession';
import WebAuthnChallenge from '../models/WebAuthnChallenge';
import RefreshToken from '../models/RefreshToken';
import {
  generateTOTPSetup,
  verifyTOTPCode,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode
} from '../services/totpService';
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication
} from '../services/webauthnService';
import { sendTwoFactorEnabledEmail } from '../services/emailService';
import { handleErrorResponse } from '../utils/responseUtils';

interface AuthRequest extends Request {
  user: {
    id: string;
  };
}

// Token helpers (same pattern as authController)
const generateAccessToken = (id: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRY || '15m';
  return jwt.sign({ id }, secret, { expiresIn: expiresIn as any });
};

const generateRefreshTokenValue = (): string => {
  return crypto.randomBytes(40).toString('hex');
};

const hashRefreshToken = (token: string): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET not configured');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(token)
    .digest('hex');
};

const saveRefreshToken = async (
  userId: string,
  token: string,
  req: Request
): Promise<void> => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const deviceInfo = req.headers['user-agent'] || 'Unknown device';
  const ipAddress = req.ip || req.connection.remoteAddress;
  const hashedToken = hashRefreshToken(token);

  await RefreshToken.create({ // NOSONAR - Mongoose ODM (parameterized)
    user: userId,
    token: hashedToken,
    expiresAt,
    deviceInfo,
    ipAddress
  });
};

// ── TOTP Setup Flow ────────────────────────────────────

export const setupTOTP = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const user = await User.findById(id); // NOSONAR - Mongoose ODM (parameterized)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { secret, encryptedSecret, otpauthUrl } = generateTOTPSetup(user.email);
    const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);

    user.totp = {
      secret: encryptedSecret,
      verified: false
    };
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        qrCodeDataURL,
        otpauthUrl,
        secret
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const verifyTOTPSetup = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const { code } = req.body;

    const user = await User.findById(id).select('+totp.secret'); // NOSONAR - Mongoose ODM (parameterized)

    if (!user || !user.totp?.secret) {
      return res.status(400).json({
        success: false,
        message: 'TOTP not set up'
      });
    }

    const isValid = verifyTOTPCode(user.totp.secret, code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    user.totp.verified = true;
    user.twoFactorEnabled = true;

    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);
    user.backupCodes = hashedCodes;

    await user.save();
    await sendTwoFactorEnabledEmail(user.email);

    res.status(200).json({
      success: true,
      data: {
        backupCodes
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const disableTOTP = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const { code } = req.body;

    const user = await User.findById(id).select('+totp.secret +backupCodes'); // NOSONAR - Mongoose ODM (parameterized)

    if (!user || !user.totp?.secret) {
      return res.status(400).json({
        success: false,
        message: 'TOTP not set up'
      });
    }

    const isValid = verifyTOTPCode(user.totp.secret, code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    user.totp = undefined;
    user.backupCodes = undefined;

    if (user.webauthnCredentials && user.webauthnCredentials.length > 0) {
      user.twoFactorEnabled = true;
    } else {
      user.twoFactorEnabled = false;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'TOTP disabled'
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const regenerateBackupCodes = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const { code } = req.body;

    const user = await User.findById(id).select('+totp.secret'); // NOSONAR - Mongoose ODM (parameterized)

    if (!user || !user.totp?.secret) {
      return res.status(400).json({
        success: false,
        message: 'TOTP not set up'
      });
    }

    const isValid = verifyTOTPCode(user.totp.secret, code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    const backupCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(backupCodes);
    user.backupCodes = hashedCodes;

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        backupCodes
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

// ── 2FA Verification (during login) ───────────────────

export const verify2FA = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { sessionId, method, code } = req.body;

    // Validate method against allowlist to prevent user-controlled auth bypass
    const ALLOWED_METHODS = ['totp', 'backup'] as const;
    if (!ALLOWED_METHODS.includes(method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid 2FA method. Must be "totp" or "backup"'
      });
    }

    const session = await TwoFactorSession.findById(sessionId); // NOSONAR - Mongoose ODM (parameterized)

    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Invalid 2FA session'
      });
    }

    if (session.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: '2FA session expired'
      });
    }

    if (session.isUsed) {
      return res.status(400).json({
        success: false,
        message: '2FA session already used'
      });
    }

    session.isUsed = true;
    await session.save();

    const userId = session.userId.toString();

    if (method === 'totp') {
      const user = await User.findById(userId).select('+totp.secret'); // NOSONAR - Mongoose ODM (parameterized)

      if (!user || !user.totp?.secret) {
        return res.status(401).json({
          success: false,
          message: 'TOTP not configured'
        });
      }

      const isValid = verifyTOTPCode(user.totp.secret, code);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid verification code'
        });
      }

      const accessToken = generateAccessToken(user._id.toString());
      const refreshToken = generateRefreshTokenValue();
      await saveRefreshToken(user._id.toString(), refreshToken, req);

      return res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin,
          colorProfile: user.colorProfile,
          accessToken,
          refreshToken
        }
      });
    }

    if (method === 'backup') {
      const user = await User.findById(userId).select('+backupCodes'); // NOSONAR - Mongoose ODM (parameterized)

      if (!user || !user.backupCodes || user.backupCodes.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'No backup codes available'
        });
      }

      const matchIndex = await verifyBackupCode(code, user.backupCodes);

      if (matchIndex === -1) {
        return res.status(401).json({
          success: false,
          message: 'Invalid backup code'
        });
      }

      user.backupCodes.splice(matchIndex, 1);
      await user.save();

      const accessToken = generateAccessToken(user._id.toString());
      const refreshToken = generateRefreshTokenValue();
      await saveRefreshToken(user._id.toString(), refreshToken, req);

      return res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin,
          colorProfile: user.colorProfile,
          accessToken,
          refreshToken
        }
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid 2FA method'
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

// ── WebAuthn ──────────────────────────────────────────

export const webauthnRegisterOptions = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const user = await User.findById(id); // NOSONAR - Mongoose ODM (parameterized)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const options = await getRegistrationOptions(
      user._id.toString(),
      user.email,
      user.username,
      user.webauthnCredentials
    );

    const challenge = await WebAuthnChallenge.create({
      challenge: options.challenge,
      type: 'registration',
      userId: user._id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    res.status(200).json({
      success: true,
      data: {
        options,
        challengeId: challenge._id
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const webauthnRegisterVerify = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const { challengeId, response, nickname } = req.body;

    const challenge = await WebAuthnChallenge.findById(challengeId); // NOSONAR - Mongoose ODM (parameterized)

    if (!challenge) {
      return res.status(400).json({
        success: false,
        message: 'Invalid challenge'
      });
    }

    const result = await verifyRegistration(response, challenge.challenge);

    if (!result.verified || !result.registrationInfo?.credential) {
      return res.status(400).json({
        success: false,
        message: 'Registration verification failed'
      });
    }

    const user = await User.findById(id); // NOSONAR - Mongoose ODM (parameterized)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { credential } = result.registrationInfo;

    user.webauthnCredentials.push({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      signCount: credential.counter,
      transports: (credential.transports || []) as string[],
      nickname: nickname || undefined,
      createdAt: new Date()
    });

    user.twoFactorEnabled = true;
    await user.save();
    await WebAuthnChallenge.findByIdAndDelete(challengeId);

    res.status(200).json({
      success: true,
      data: {
        credentialId: credential.id,
        nickname: nickname || undefined
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const webauthnLoginOptions = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email } = req.body;
    let allowCredentials;
    let userId;

    if (email) {
      const user = await User.findOne({ email }); // NOSONAR - Mongoose ODM (parameterized)
      if (user && user.webauthnCredentials.length > 0) {
        allowCredentials = user.webauthnCredentials;
        userId = user._id;
      }
    }

    const options = await getAuthenticationOptions(allowCredentials);

    const challenge = await WebAuthnChallenge.create({
      challenge: options.challenge,
      type: 'authentication',
      userId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    res.status(200).json({
      success: true,
      data: {
        options,
        challengeId: challenge._id
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const webauthnLoginVerify = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { challengeId, response } = req.body;

    const challenge = await WebAuthnChallenge.findById(challengeId); // NOSONAR - Mongoose ODM (parameterized)

    if (!challenge) {
      return res.status(400).json({
        success: false,
        message: 'Invalid challenge'
      });
    }

    const user = await User.findOne({
      'webauthnCredentials.credentialId': response.id
    }).select('+webauthnCredentials.publicKey'); // NOSONAR - Mongoose ODM (parameterized)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credential not found'
      });
    }

    const credential = user.webauthnCredentials.find(
      (c) => c.credentialId === response.id
    );

    if (!credential) {
      return res.status(401).json({
        success: false,
        message: 'Credential not found'
      });
    }

    const result = await verifyAuthentication(
      response,
      challenge.challenge,
      credential.publicKey,
      credential.signCount
    );

    if (!result.verified) {
      return res.status(401).json({
        success: false,
        message: 'Authentication verification failed'
      });
    }

    credential.signCount = result.authenticationInfo.newCounter;
    await user.save();
    await WebAuthnChallenge.findByIdAndDelete(challengeId);

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshTokenValue();
    await saveRefreshToken(user._id.toString(), refreshToken, req);

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        colorProfile: user.colorProfile,
        accessToken,
        refreshToken
      }
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const deleteWebAuthnCredential = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = (req as AuthRequest).user;
    const credentialId = req.params.id;

    const user = await User.findById(id); // NOSONAR - Mongoose ODM (parameterized)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const credIndex = user.webauthnCredentials.findIndex(
      (c) => c.credentialId === credentialId
    );

    if (credIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found'
      });
    }

    user.webauthnCredentials.splice(credIndex, 1);

    if (user.webauthnCredentials.length === 0 && !user.totp) {
      user.twoFactorEnabled = false;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Credential deleted'
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};
