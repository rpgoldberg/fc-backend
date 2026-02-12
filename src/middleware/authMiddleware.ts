import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

interface JwtPayload {
  id: string;
}

// User type is already declared in src/types/express.d.ts

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  let token: string | undefined;

  // Check Authorization header first
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Fall back to query parameter (for SSE connections that can't use headers)
  else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }

  try {

    // Verify token signature
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // ZERO TRUST: Verify user exists in database on every request
    // This prevents tokens from other database instances from being accepted
    const userExists = await User.exists({ _id: decoded.id });
    if (!userExists) {
      return res.status(401).json({
        success: false,
        message: 'User not found - session invalid',
        code: 'USER_NOT_FOUND'
      });
    }

    // Add user ID to request
    req.user = {
      id: decoded.id
    };

    // Note: Token refresh is now handled via the /auth/refresh endpoint
    // Clients should monitor token expiry and refresh as needed

    next();
  } catch (error: any) {
    // Provide more specific error messages for better client handling
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Not authorized, token failed'
    });
  }
};

// Admin middleware
export const admin = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no user token'
      });
    }
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, user not found'
      });
    }
    
    if (user.isAdmin) {
      next();
      return;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required'
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};
