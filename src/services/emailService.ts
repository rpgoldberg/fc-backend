import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@figurecollecting.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5081';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!resend) {
    // Console fallback for dev/test environments
    console.log('═══════════════════════════════════════');
    console.log('EMAIL (console fallback)');
    console.log('To:', JSON.stringify(options.to));
    console.log('Subject:', JSON.stringify(options.subject));
    console.log('Body:', JSON.stringify(options.html));
    console.log('═══════════════════════════════════════');
    return;
  }

  await resend.emails.send({
    from: EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}

export async function sendVerificationEmail(email: string, token: string, userId: string): Promise<void> {
  // Import here to avoid circular deps
  const { verificationEmail } = await import('../templates/emails');
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}&uid=${userId}`;
  await sendEmail({
    to: email,
    subject: 'Verify your email - FigureCollecting',
    html: verificationEmail(verifyUrl),
  });
}

export async function sendPasswordResetEmail(email: string, token: string, userId: string): Promise<void> {
  const { passwordResetEmail } = await import('../templates/emails');
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}&uid=${userId}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password - FigureCollecting',
    html: passwordResetEmail(resetUrl),
  });
}

export async function sendPasswordChangedEmail(email: string): Promise<void> {
  const { passwordChangedEmail } = await import('../templates/emails');
  await sendEmail({
    to: email,
    subject: 'Your password was changed - FigureCollecting',
    html: passwordChangedEmail(),
  });
}

export async function sendTwoFactorEnabledEmail(email: string): Promise<void> {
  const { twoFactorEnabledEmail } = await import('../templates/emails');
  await sendEmail({
    to: email,
    subject: 'Two-factor authentication enabled - FigureCollecting',
    html: twoFactorEnabledEmail(),
  });
}
