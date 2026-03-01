import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const TOTP_ISSUER = 'FigureCollecting';
const ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY; // 64-char hex string = 32 bytes

// AES-256-GCM encryption for TOTP secrets
export function encryptSecret(plaintext: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('TOTP_ENCRYPTION_KEY not configured');
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptSecret(encrypted: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('TOTP_ENCRYPTION_KEY not configured');
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Generate a new TOTP secret and return setup data
export function generateTOTPSetup(userEmail: string): {
  secret: string;          // plaintext secret (for QR code)
  encryptedSecret: string; // encrypted secret (for storage)
  otpauthUrl: string;      // otpauth:// URL for QR code
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret,
  });

  return {
    secret: secret.base32,
    encryptedSecret: encryptSecret(secret.base32),
    otpauthUrl: totp.toString(),
  };
}

// Verify a TOTP code against an encrypted secret
export function verifyTOTPCode(encryptedSecret: string, code: string): boolean {
  const secretBase32 = decryptSecret(encryptedSecret);
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  // Allow 1-step tolerance (±30 seconds for clock skew)
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

// Generate backup codes
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8-character alphanumeric codes, formatted as xxxx-xxxx
    const raw = crypto.randomBytes(4).toString('hex');
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

// Hash backup codes for storage
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashed = await Promise.all(
    codes.map(code => bcrypt.hash(code.replace('-', ''), 10))
  );
  return hashed;
}

// Verify a backup code against hashed codes, return index if found (-1 if not)
export async function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): Promise<number> {
  const normalized = code.replace('-', '');
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalized, hashedCodes[i]);
    if (match) return i;
  }
  return -1;
}
