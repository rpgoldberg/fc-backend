import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import EmailVerificationToken from '../models/EmailVerificationToken';
import PasswordResetToken from '../models/PasswordResetToken';
import RefreshToken from '../models/RefreshToken';
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from '../services/emailService';
import { handleErrorResponse } from '../utils/responseUtils';

const BCRYPT_SALT_ROUNDS = 10;
const EMAIL_VERIFICATION_EXPIRY_MS = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || '24', 10) * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MS = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || '30', 10) * 60 * 1000;

export const verifyEmail = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Verification token and user ID are required'
      });
    }

    // Find non-expired, non-used tokens scoped to this user
    const tokens = await EmailVerificationToken.find({
      userId,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    // Compare the provided token against each stored hash (typically 1-2 tokens per user)
    let matchedToken = null;
    for (const storedToken of tokens) {
      const isMatch = await bcrypt.compare(token, storedToken.tokenHash);
      if (isMatch) {
        matchedToken = storedToken;
        break;
      }
    }

    if (!matchedToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Mark token as used
    matchedToken.isUsed = true;
    await matchedToken.save();

    // Update user as verified
    await User.findByIdAndUpdate(matchedToken.userId, {
      emailVerified: true,
      emailVerifiedAt: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const resendVerification = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Always return success to prevent email enumeration
    const genericResponse = {
      success: true,
      message: 'If that email exists, a verification link has been sent'
    };

    const user = await User.findOne({ email });
    if (!user || user.emailVerified) {
      return res.status(200).json(genericResponse);
    }

    // Delete any existing unused tokens for this user
    await EmailVerificationToken.deleteMany({
      userId: user._id,
      isUsed: false
    });

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_SALT_ROUNDS);

    // Store hashed token
    await EmailVerificationToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS)
    });

    // Send verification email with raw token
    await sendVerificationEmail(user.email, rawToken, (user._id as any).toString());

    return res.status(200).json(genericResponse);
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Always return success to prevent email enumeration
    const genericResponse = {
      success: true,
      message: 'If that email exists, a password reset link has been sent'
    };

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Delete any existing unused password reset tokens for this user
    await PasswordResetToken.deleteMany({
      userId: user._id,
      isUsed: false
    });

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_SALT_ROUNDS);

    // Store hashed token
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS)
    });

    // Send password reset email with raw token
    await sendPasswordResetEmail(user.email, rawToken, (user._id as any).toString());

    return res.status(200).json(genericResponse);
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { token, password, userId } = req.body;

    if (!token || !password || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Token, password, and user ID are required'
      });
    }

    // Find non-expired, non-used tokens scoped to this user
    const tokens = await PasswordResetToken.find({
      userId,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    // Compare the provided token against each stored hash (typically 1 token per user)
    let matchedToken = null;
    for (const storedToken of tokens) {
      const isMatch = await bcrypt.compare(token, storedToken.tokenHash);
      if (isMatch) {
        matchedToken = storedToken;
        break;
      }
    }

    if (!matchedToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Mark token as used
    matchedToken.isUsed = true;
    await matchedToken.save();

    // Update user's password (use save to trigger pre-save bcrypt hook)
    const user = await User.findById(matchedToken.userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = password;
    await user.save();

    // Delete all refresh tokens to force re-login on all devices
    await RefreshToken.deleteMany({ user: user._id });

    // Send password changed notification
    await sendPasswordChangedEmail(user.email);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error: any) {
    return handleErrorResponse(res, error);
  }
};
