import { Request, Response, NextFunction } from 'express';

function hasInvalidKey(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  if (Array.isArray(obj)) {
    return obj.some(item => hasInvalidKey(item));
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (hasInvalidKey((obj as Record<string, unknown>)[key])) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware that rejects requests containing keys with '$' prefix or '.' in body, query, or params.
 * Prevents NoSQL operator injection attacks.
 */
export function nosqlSanitizer(req: Request, res: Response, next: NextFunction): void {
  if (hasInvalidKey(req.body) || hasInvalidKey(req.query) || hasInvalidKey(req.params)) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid characters or operator keys detected in request parameters.'
    });
    return;
  }
  next();
}
