import { Request, Response, NextFunction } from 'express';
import User from '../models/User';

/**
 * Middleware that requires email verification.
 * Must be used AFTER the protect middleware (req.user must exist).
 *
 * Behavior:
 * - If user.emailVerified is true → pass through
 * - If grace period hasn't expired → pass through (but frontend should show banner)
 * - If grace period expired → return 403 with code EMAIL_NOT_VERIFIED
 */
export const requireVerifiedEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const user = await User.findById(req.user.id).select('emailVerified emailVerificationGraceExpiry');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Already verified
    if (user.emailVerified) {
      return next();
    }

    // Within grace period
    if (user.emailVerificationGraceExpiry && user.emailVerificationGraceExpiry > new Date()) {
      return next();
    }

    // Grace period expired or never set — block access
    return res.status(403).json({
      success: false,
      message: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
