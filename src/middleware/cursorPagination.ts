import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that parses cursor-based pagination parameters.
 *
 * Usage: GET /figures?after=<lastId>&limit=20
 *        GET /figures?before=<firstId>&limit=20
 *
 * Attaches cursor info to req.cursorPagination for the controller to use.
 * Works alongside existing page-based pagination (doesn't replace it).
 * When neither after nor before is present, no cursor pagination is set.
 */
export function cursorPagination() {
  return (req: Request, res: Response, next: NextFunction) => {
    const after = req.query.after as string | undefined;
    const before = req.query.before as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (after || before) {
      (req as any).cursorPagination = {
        after,      // ID of the last item from previous page
        before,     // ID of the first item (for backwards pagination)
        limit,
      };
    }

    next();
  };
}
