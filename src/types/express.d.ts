import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        username?: string;
        emailVerified?: boolean;
        emailVerificationGraceExpiry?: Date;
        twoFactorEnabled?: boolean;
      };
    }
  }
}

export {};