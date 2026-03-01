import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { MFC_LIST_LIMITS } from '../models/MfcList';

export const validateRequest = (schema: Joi.ObjectSchema, source: 'body' | 'query' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const dataToValidate = source === 'query' ? req.query : req.body;
    const { error, value } = schema.validate(dataToValidate, { 
      abortEarly: false,  // Return all validation errors, not just the first
      allowUnknown: false, // Reject unknown properties
      convert: true  // Attempt to convert values to correct types
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        message: detail.message,
        path: detail.path
      }));

      // Detailed error type classification
      const errorAnalysis = {
        isNumericError: errorDetails.some(err => err.message.includes('must be a number')),
        isRangeError: errorDetails.some(err => err.message.includes('must be greater')),
        isRequiredError: errorDetails.some(err => err.message.includes('required')),
        isPatternError: errorDetails.some(err => err.message.includes('pattern')),
        isTypeError: errorDetails.some(err => err.message.includes('must be a'))
      };

      // Determine status code and primary error message
      const determineErrorResponse = () => {
        if (errorAnalysis.isRequiredError) {
          return {
            status: 422,
            message: 'Validation Error',
            verbose: 'Please provide all required fields correctly'
          };
        }
        if (errorAnalysis.isNumericError || errorAnalysis.isRangeError) {
          return {
            status: 422,
            message: 'Validation Error',
            verbose: 'Numeric values do not meet validation requirements'
          };
        }
        if (errorAnalysis.isPatternError) {
          return {
            status: 422,
            message: 'Validation Error',
            verbose: 'Input does not match the required pattern or format'
          };
        }
        if (errorAnalysis.isTypeError) {
          return {
            status: 422,
            message: 'Validation Error',
            verbose: 'Provided data type is incompatible with expected type'
          };
        }
        return {
          status: 422,
          message: 'Validation Error',
          verbose: 'One or more validation checks did not pass'
        };
      };

      const errorResponse = determineErrorResponse();

      return res.status(errorResponse.status).json({
        success: false,
        message: errorResponse.message,
        verbose: errorResponse.verbose,
        errors: errorDetails
      });
    }

    // Update request object with converted values
    if (source === 'query') {
      // Express v5 made req.query immutable, so we need to redefine it
      Object.defineProperty(req, 'query', {
        value,
        writable: true,
        enumerable: true,
        configurable: true
      });
    } else {
      req.body = value;
    }

    next();
    return;
  };
};

// Validation schemas
export const schemas = {

  figure: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    // Schema v3: manufacturer optional when companyRoles present
    manufacturer: Joi.string().trim().min(2).max(100).optional().allow(''),
    type: Joi.string().valid('action figure', 'statue', 'collectible').default('action figure'),
    description: Joi.string().allow('').max(1000).optional(),
    scale: Joi.string().optional(),
    purchaseInfo: Joi.object({
      price: Joi.number().min(0).precision(2).optional(),
      date: Joi.date().optional(),
      source: Joi.string().max(100).allow('').optional()
    }).optional(),
    // Schema v3: Company/Artist roles
    companyRoles: Joi.array().items(
      Joi.object({
        companyId: Joi.string().optional(),
        companyName: Joi.string().trim().min(1).max(100).required(),
        roleId: Joi.string().optional(),
        roleName: Joi.string().optional()
      })
    ).optional(),
    artistRoles: Joi.array().items(
      Joi.object({
        artistId: Joi.string().optional(),
        artistName: Joi.string().trim().min(1).max(100).required(),
        roleId: Joi.string().optional(),
        roleName: Joi.string().optional()
      })
    ).optional(),
    releases: Joi.array().items(
      Joi.object({
        date: Joi.string().optional(),
        price: Joi.number().optional(),
        currency: Joi.string().optional(),
        jan: Joi.string().optional(),
        isRerelease: Joi.boolean().optional()
      })
    ).optional()
  }),

  user: Joi.object({
    email: Joi.string().email({ 
      minDomainSegments: 2, 
      tlds: { allow: ['com', 'net', 'org', 'edu', 'io'] } 
    }).required(),
    password: Joi.string()
      .min(8)
      .max(72)  // bcrypt max length
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])?(?=.*\\d)?(?=.*[@$!%*?&])?[A-Za-z\\d@$!%*?&]{8,}$'))
      .message('Password should ideally include lowercase, uppercase, number, and special character'),
    username: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_-]+$/).required()
  }),

  pagination: Joi.object({
    page: Joi.alternatives()
      .try(
        Joi.number().integer().min(1).max(1000).default(1),
        Joi.string().trim().pattern(/^\d+$/).min(1).max(3).default('1')
      ).default(1),
    limit: Joi.alternatives()
      .try(
        Joi.number().integer().min(1).max(100).default(10),
        Joi.string().trim().pattern(/^\d+$/).min(1).max(3).default('10')
      ).default(10),
    offset: Joi.alternatives()
      .try(
        Joi.number().integer().min(0).optional(),
        Joi.string().trim().pattern(/^\d+$/).optional()
      ).optional(),
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'name', 'manufacturer', 'scale', 'activity')
      .insensitive()
      .default('createdAt')
      .optional(),
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .optional(),
    // Collection status filter for owned/ordered/wished views
    status: Joi.string()
      .valid('owned', 'ordered', 'wished')
      .optional()
  }).allow(null),

  // Schema v3.0 - Enhanced figure creation schema
  figureCreate: Joi.object({
    // Core fields - conditional validation based on mfcLink presence
    name: Joi.when('mfcLink', {
      is: Joi.exist(),
      then: Joi.string().trim().max(200).allow('').optional(),
      otherwise: Joi.string().trim().min(1).max(200).required()
        .messages({
          'string.empty': 'Name is required',
          'any.required': 'Name is required',
          'string.min': 'Name is required'
        })
    }),
    manufacturer: Joi.when('mfcLink', {
      is: Joi.exist(),
      then: Joi.string().trim().max(100).allow('').optional(),
      otherwise: Joi.string().trim().min(1).max(100).required()
        .messages({
          'string.empty': 'Manufacturer is required',
          'any.required': 'Manufacturer is required',
          'string.min': 'Manufacturer is required'
        })
    }),
    scale: Joi.string().allow('').max(50).optional(),
    imageUrl: Joi.string().uri().allow('').optional(),

    // MFC integration - accept full URL or just item ID (e.g., "287844")
    mfcLink: Joi.alternatives().try(
      Joi.string().uri(),
      Joi.string().pattern(/^\d+$/).max(20), // Just the numeric item ID
      Joi.string().allow('')
    ).optional(),
    mfcId: Joi.number().integer().positive().optional(),
    mfcAuth: Joi.string().allow('').optional(), // Not stored, only for scraping

    // Product identification
    jan: Joi.string().max(15).allow('').optional(), // JAN/EAN/UPC barcode

    // Schema v3: MFC-specific fields
    mfcTitle: Joi.string().max(300).allow('').optional(),
    origin: Joi.string().max(200).allow('').optional(),
    version: Joi.string().max(200).allow('').optional(),
    category: Joi.string().max(100).allow('').optional(),
    classification: Joi.string().max(100).allow('').optional(),
    materials: Joi.string().max(200).allow('').optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional(),

    // Schema v3: Company roles array
    companyRoles: Joi.array().items(Joi.object({
      companyId: Joi.string().allow('').optional(),
      companyName: Joi.string().max(200).allow('').optional(),
      roleId: Joi.string().allow('').optional(),
      roleName: Joi.string().max(100).allow('').optional(),
    })).optional(),

    // Schema v3: Artist roles array
    artistRoles: Joi.array().items(Joi.object({
      artistId: Joi.string().allow('').optional(),
      artistName: Joi.string().max(200).allow('').optional(),
      roleId: Joi.string().allow('').optional(),
      roleName: Joi.string().max(100).allow('').optional(),
    })).optional(),

    // Schema v3: Releases array
    releases: Joi.array().items(Joi.object({
      date: Joi.alternatives().try(Joi.date(), Joi.string().allow('')).optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().max(10).allow('').optional(),
      jan: Joi.string().max(15).allow('').optional(),
      isRerelease: Joi.boolean().optional(),
      variant: Joi.string().max(200).allow('').optional(),
    })).optional(),

    // Release info (flat form fields mapped to releases array)
    releaseDate: Joi.alternatives()
      .try(Joi.date(), Joi.string().allow(''))
      .optional(),
    releasePrice: Joi.number().min(0).optional(),
    releaseCurrency: Joi.string().max(10).allow('').optional(),

    // Physical dimensions
    heightMm: Joi.number().min(0).optional(),
    widthMm: Joi.number().min(0).optional(),
    depthMm: Joi.number().min(0).optional(),

    // User-specific collection data
    collectionStatus: Joi.string()
      .valid('owned', 'ordered', 'wished')
      .default('owned')
      .optional(),
    rating: Joi.number().integer().min(1).max(10).optional(),
    wishRating: Joi.number().integer().min(1).max(5).optional(),
    quantity: Joi.number().integer().min(1).default(1).optional(),
    note: Joi.string().max(2000).allow('').optional(),

    // Purchase info (flat form fields mapped to purchaseInfo object)
    purchaseDate: Joi.alternatives()
      .try(Joi.date(), Joi.string().allow(''))
      .optional(),
    purchasePrice: Joi.number().min(0).optional(),
    purchaseCurrency: Joi.string().max(10).allow('').optional(),

    // Merchant info (flat form fields mapped to merchant object)
    merchantName: Joi.string().max(100).allow('').optional(),
    merchantUrl: Joi.string().uri().allow('').optional(),

    // Condition tracking - allow empty string (treated as unset)
    figureCondition: Joi.string()
      .valid('sealed', 'likenew', 'verygood', 'good', 'fair', 'poor', '')
      .optional(),
    figureConditionNotes: Joi.string().max(500).allow('').optional(),
    boxCondition: Joi.string()
      .valid('mint', 'verygood', 'good', 'fair', 'poor', '')
      .optional(),
    boxConditionNotes: Joi.string().max(500).allow('').optional(),

    // Legacy/compatibility fields
    type: Joi.string().valid('action figure', 'statue', 'collectible')
      .default('action figure'),
    description: Joi.string().allow('').max(1000).optional(),
    purchaseInfo: Joi.object({
      price: Joi.number().min(0).precision(2).optional(),
      date: Joi.alternatives()
        .try(Joi.date().optional(), Joi.string().allow('').optional()),
      source: Joi.string().max(100).allow('').optional(),
      currency: Joi.string().max(10).allow('').optional()
    }).optional(),
    mfcUrl: Joi.string().uri().allow('').optional(),
    mfcData: Joi.object({
      manufacturer: Joi.string().optional(),
      name: Joi.string().optional(),
      scale: Joi.string().optional(),
      imageUrl: Joi.string().uri().optional()
    }).optional()
  })
  // Allow any additional fields for flexibility during transition
  .pattern(/.*/, Joi.any().optional())
  .default(() => ({})),

  // Schema v3.0 - Enhanced figure update schema
  figureUpdate: Joi.object({
    // Core fields
    name: Joi.string().trim().max(200).allow('').optional(),
    manufacturer: Joi.string().trim().max(100).allow('').optional(),
    scale: Joi.string().allow('').max(50).optional(),
    imageUrl: Joi.string().uri().allow('').optional(),

    // MFC integration - accept full URL or just item ID (e.g., "287844")
    mfcLink: Joi.alternatives().try(
      Joi.string().uri(),
      Joi.string().pattern(/^\d+$/).max(20), // Just the numeric item ID
      Joi.string().allow('')
    ).optional(),
    mfcId: Joi.number().integer().positive().optional(),

    // Product identification
    jan: Joi.string().max(15).allow('').optional(),

    // Schema v3: MFC-specific fields
    mfcTitle: Joi.string().max(300).allow('').optional(),
    origin: Joi.string().max(200).allow('').optional(),
    version: Joi.string().max(200).allow('').optional(),
    category: Joi.string().max(100).allow('').optional(),
    classification: Joi.string().max(100).allow('').optional(),
    materials: Joi.string().max(200).allow('').optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional(),

    // Schema v3: Company roles array
    companyRoles: Joi.array().items(Joi.object({
      companyId: Joi.string().allow('').optional(),
      companyName: Joi.string().max(200).allow('').optional(),
      roleId: Joi.string().allow('').optional(),
      roleName: Joi.string().max(100).allow('').optional(),
    })).optional(),

    // Schema v3: Artist roles array
    artistRoles: Joi.array().items(Joi.object({
      artistId: Joi.string().allow('').optional(),
      artistName: Joi.string().max(200).allow('').optional(),
      roleId: Joi.string().allow('').optional(),
      roleName: Joi.string().max(100).allow('').optional(),
    })).optional(),

    // Schema v3: Releases array
    releases: Joi.array().items(Joi.object({
      date: Joi.alternatives().try(Joi.date(), Joi.string().allow('')).optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().max(10).allow('').optional(),
      jan: Joi.string().max(15).allow('').optional(),
      isRerelease: Joi.boolean().optional(),
      variant: Joi.string().max(200).allow('').optional(),
    })).optional(),

    // Release info (flat form fields - legacy)
    releaseDate: Joi.alternatives()
      .try(Joi.date(), Joi.string().allow(''))
      .optional(),
    releasePrice: Joi.number().min(0).optional(),
    releaseCurrency: Joi.string().max(10).allow('').optional(),

    // Physical dimensions
    heightMm: Joi.number().min(0).optional(),
    widthMm: Joi.number().min(0).optional(),
    depthMm: Joi.number().min(0).optional(),

    // User-specific collection data
    collectionStatus: Joi.string()
      .valid('owned', 'ordered', 'wished')
      .optional(),
    rating: Joi.number().integer().min(1).max(10).optional(),
    wishRating: Joi.number().integer().min(1).max(5).optional(),
    quantity: Joi.number().integer().min(1).optional(),
    note: Joi.string().max(2000).allow('').optional(),

    // Purchase info
    purchaseDate: Joi.alternatives()
      .try(Joi.date(), Joi.string().allow(''))
      .optional(),
    purchasePrice: Joi.number().min(0).optional(),
    purchaseCurrency: Joi.string().max(10).allow('').optional(),

    // Merchant info
    merchantName: Joi.string().max(100).allow('').optional(),
    merchantUrl: Joi.string().uri().allow('').optional(),

    // Condition tracking - allow empty string (treated as unset)
    figureCondition: Joi.string()
      .valid('sealed', 'likenew', 'verygood', 'good', 'fair', 'poor', '')
      .optional(),
    figureConditionNotes: Joi.string().max(500).allow('').optional(),
    boxCondition: Joi.string()
      .valid('mint', 'verygood', 'good', 'fair', 'poor', '')
      .optional(),
    boxConditionNotes: Joi.string().max(500).allow('').optional(),

    // Legacy/compatibility
    type: Joi.string().valid('action figure', 'statue', 'collectible').optional(),
    description: Joi.string().allow('').max(1000).optional(),
    purchaseInfo: Joi.object({
      price: Joi.number().min(0).precision(2).optional(),
      date: Joi.alternatives()
        .try(Joi.date(), Joi.string().allow(''))
        .optional(),
      source: Joi.string().max(100).allow('').optional(),
      currency: Joi.string().max(10).allow('').optional()
    }).optional(),
    mfcData: Joi.object({
      manufacturer: Joi.string().optional(),
      name: Joi.string().optional(),
      scale: Joi.string().optional(),
      imageUrl: Joi.string().uri().optional()
    }).optional()
  })
  // Allow any additional fields for flexibility
  .pattern(/.*/, Joi.any().optional())
  .min(1),

  // User validation schemas
  userRegister: Joi.object({
    username: Joi.string().trim().min(3).max(30).alphanum().required(),
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(6).max(100).required(),
    isAdmin: Joi.boolean().default(false).optional()
  }),

  userLogin: Joi.object({
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(1).required()
  }),

  userUpdate: Joi.object({
    username: Joi.string().trim().min(3).max(30).alphanum().optional(),
    email: Joi.string().trim().email().optional(),
    password: Joi.string().min(6).max(100).optional(),
    currentPassword: Joi.string().min(1).optional()
  }).min(1),

  // Refresh token validation schema
  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  }),

  // Search validation schema
  search: Joi.object({
    query: Joi.string().min(1).max(100).required(),
    fields: Joi.array().items(Joi.string().valid('name', 'manufacturer', 'origin', 'category')).optional(),
    page: Joi.alternatives()
      .try(
        Joi.number().integer().min(1).max(1000).default(1),
        Joi.string().trim().pattern(/^\d+$/).min(1).max(3).default('1')
      ).default(1),
    limit: Joi.alternatives()
      .try(
        Joi.number().integer().min(1).max(100).default(10),
        Joi.string().trim().pattern(/^\d+$/).min(1).max(3).default('10')
      ).default(10)
  }),

  // Filter validation schema
  // Note: max lengths increased to accommodate comma-separated multi-select values
  filter: Joi.object({
    manufacturer: Joi.string().min(1).max(500).optional(),
    distributor: Joi.string().min(1).max(500).optional(),
    type: Joi.string().valid('action figure', 'statue', 'collectible').optional(),
    scale: Joi.string().min(1).max(200).optional(),
    origin: Joi.string().min(1).max(500).optional(),
    category: Joi.string().min(1).max(500).optional(),
    tag: Joi.string().min(1).max(100).optional(),
    tagGroup: Joi.string().min(1).max(50).optional(),
    sculptor: Joi.string().min(1).max(500).optional(),
    illustrator: Joi.string().min(1).max(500).optional(),
    classification: Joi.string().min(1).max(500).optional(),
    status: Joi.string().valid('owned', 'ordered', 'wished').optional(),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'manufacturer', 'scale', 'activity').insensitive().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
    page: Joi.alternatives()
      .try(
        Joi.number().integer().min(1).max(1000).default(1),
        Joi.string().trim().pattern(/^\d+$/).min(1).max(3).default('1')
      ).default(1),
    limit: Joi.alternatives()
      .try(
        Joi.number().integer().min(1).max(100).default(10),
        Joi.string().trim().pattern(/^\d+$/).min(1).max(3).default('10')
      ).default(10)
  }),

  // List validation schemas — limits match MFC edit form to prevent round-trip data loss
  listCreate: Joi.object({
    mfcId: Joi.number().integer().required()
      .messages({ 'any.required': 'mfcId is required' }),
    name: Joi.string().trim().min(1).max(MFC_LIST_LIMITS.NAME_MAX).required()
      .messages({
        'any.required': 'name is required',
        'string.empty': 'name is required'
      }),
    teaser: Joi.string().trim().max(MFC_LIST_LIMITS.TEASER_MAX).allow('').optional(),
    description: Joi.string().allow('').optional(),
    privacy: Joi.string().valid('public', 'friends', 'private').optional(),
    iconUrl: Joi.string().allow('').optional(),
    allowComments: Joi.boolean().optional(),
    mailOnSales: Joi.boolean().optional(),
    mailOnHunts: Joi.boolean().optional(),
    itemMfcIds: Joi.array().items(Joi.number().integer()).optional(),
    mfcCreatedAt: Joi.date().optional(),
    mfcLastEditedAt: Joi.date().optional(),
    lastSyncedAt: Joi.date().optional()
  }),

  listUpdate: Joi.object({
    name: Joi.string().trim().min(1).max(MFC_LIST_LIMITS.NAME_MAX).optional(),
    teaser: Joi.string().trim().max(MFC_LIST_LIMITS.TEASER_MAX).allow('').optional(),
    description: Joi.string().allow('').optional(),
    privacy: Joi.string().valid('public', 'friends', 'private').optional(),
    iconUrl: Joi.string().allow('').optional(),
    allowComments: Joi.boolean().optional(),
    mailOnSales: Joi.boolean().optional(),
    mailOnHunts: Joi.boolean().optional(),
    itemMfcIds: Joi.array().items(Joi.number().integer()).optional(),
    mfcCreatedAt: Joi.date().optional(),
    mfcLastEditedAt: Joi.date().optional(),
    lastSyncedAt: Joi.date().optional()
  }).min(1),

  // Auth modernization schemas
  verifyEmail: Joi.object({
    token: Joi.string().required(),
    userId: Joi.string().required()
  }),

  resendVerification: Joi.object({
    email: Joi.string().trim().email().required()
  }),

  forgotPassword: Joi.object({
    email: Joi.string().trim().email().required()
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(6).max(100).required(),
    userId: Joi.string().required()
  }),

  verify2FA: Joi.object({
    sessionId: Joi.string().required(),
    method: Joi.string().valid('totp', 'backup', 'webauthn').required(),
    code: Joi.string().required()
  }),

  totpVerifySetup: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required()
  }),

  totpDisable: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required()
  }),

  regenerateBackupCodes: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required()
  }),

  webauthnRegisterOptions: Joi.object({
    nickname: Joi.string().max(50).optional()
  }),

  webauthnRegisterVerify: Joi.object({
    challengeId: Joi.string().required(),
    response: Joi.object().required()
  }),

  webauthnLoginOptions: Joi.object({
    email: Joi.string().trim().email().optional()
  }),

  webauthnLoginVerify: Joi.object({
    challengeId: Joi.string().required(),
    response: Joi.object().required()
  })
};

// Content-type validation middleware
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const contentType = req.headers['content-type'];

    if (!contentType || !allowedTypes.includes(contentType)) {
      return res.status(415).json({
        message: 'Unsupported Media Type',
        allowedTypes
      });
    }

    next();
    return;
  };
};

// SECURITY FIX: MongoDB ObjectId validation middleware
export const validateObjectId = (paramName: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const id = req.params[paramName] as string | undefined;
    
    if (!id) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: `${paramName} parameter is required`, path: [paramName] }]
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error', 
        errors: [{ message: `Invalid ${paramName} format`, path: [paramName] }]
      });
    }

    next();
    return;
  };
};

// SECURITY FIX: Enhanced global error handler with CastError handling
export const globalErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const isProd = process.env.NODE_ENV === 'production';

  // Always log full error in non-production environments
  if (!isProd) {
    console.error('Global Error Handler caught:', err);
  }

  // Specific error handling with detailed error tracking
  const handleError = (status: number, message: string, errors?: any[]) => {
    return res.status(status).json({
      success: false,
      message,
      ...(errors && { errors }),
      ...(status === 500 && !isProd && { debugInfo: err.message })
    });
  };

  // Prioritized error type handlers
  switch (err.name) {
    case 'CastError':
      if (err.message.includes('ObjectId')) {
        return handleError(422, 'Validation Error', [{ 
          message: 'Invalid ID format', 
          path: ['id'] 
        }]);
      }
      break;

    case 'ValidationError':
      return handleError(422, 'Validation Error', 
        Object.values((err as any).errors).map((error: any) => ({
          message: error.message,
          path: [error.path]
        }))
      );

    case 'SyntaxError':
      if (err.message.includes('JSON')) {
        return handleError(400, 'Invalid JSON format');
      }
      break;

    default:
      // Catch-all for unhandled errors
      return handleError(500, 'Internal Server Error');
  }

  // Fallback error handler
  return handleError(500, 'Internal Server Error');
};