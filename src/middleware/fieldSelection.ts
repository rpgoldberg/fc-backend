import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that parses ?fields= query parameter and attaches
 * a Mongoose projection to req.fieldProjection.
 *
 * Usage: GET /figures?fields=_id,name,imageUrl,manufacturer,scale,collectionStatus
 *
 * If allowedFields is specified, only those fields can be projected.
 * _id is always included in the projection when fields are requested.
 * When no fields param is present, no projection is set (full objects returned).
 */
export function fieldSelection(allowedFields?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const fieldsParam = req.query.fields as string | undefined;

    if (!fieldsParam) {
      // No field selection — return full objects
      next();
      return;
    }

    const requestedFields = fieldsParam.split(',').map(f => f.trim()).filter(Boolean);

    // Always include _id
    const projection: Record<string, 1> = { _id: 1 };

    for (const field of requestedFields) {
      // If allowedFields is specified, only allow those
      if (allowedFields && !allowedFields.includes(field)) {
        continue;
      }
      projection[field] = 1;
    }

    // Attach to request for controller to use
    (req as any).fieldProjection = projection;
    next();
  };
}
