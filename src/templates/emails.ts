// Common wrapper for consistent email styling
function emailWrapper(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #1a1a2e; margin-top: 0; }
        .btn { display: inline-block; background: #4361ee; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        ${content}
        <div class="footer">
          <p>FigureCollecting — Your figure collection manager</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function verificationEmail(verifyUrl: string): string {
  return emailWrapper(`
    <h1>Verify your email address</h1>
    <p>Thanks for signing up for FigureCollecting! Please verify your email address by clicking the button below:</p>
    <a href="${verifyUrl}" class="btn">Verify Email</a>
    <p>Or copy this link: <code>${verifyUrl}</code></p>
    <p>This link expires in 24 hours.</p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `);
}

export function passwordResetEmail(resetUrl: string): string {
  return emailWrapper(`
    <h1>Reset your password</h1>
    <p>We received a request to reset your password. Click the button below to choose a new one:</p>
    <a href="${resetUrl}" class="btn">Reset Password</a>
    <p>Or copy this link: <code>${resetUrl}</code></p>
    <p>This link expires in 30 minutes.</p>
    <p>If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>
  `);
}

export function passwordChangedEmail(): string {
  return emailWrapper(`
    <h1>Password changed</h1>
    <p>Your password was successfully changed.</p>
    <p>If you did not make this change, please reset your password immediately or contact support.</p>
  `);
}

export function twoFactorEnabledEmail(): string {
  return emailWrapper(`
    <h1>Two-factor authentication enabled</h1>
    <p>Two-factor authentication has been enabled on your account. You'll now need to provide a verification code when signing in.</p>
    <p>Make sure you've saved your backup codes in a safe place.</p>
    <p>If you did not enable this, please contact support immediately.</p>
  `);
}
