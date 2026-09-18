import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

/**
 * Turns a zod issue into something a shop owner can read in the app.
 * The mobile client shows `error` verbatim, so it must never be a JSON dump.
 */
function humanizeZodError(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Please check the details you entered.';

  const field = String(issue.path[issue.path.length - 1] ?? 'value');
  const label =
    field === 'password'
      ? 'Password'
      : field === 'email'
        ? 'Email'
        : field === 'orgName'
          ? 'Business name'
          : field === 'idToken'
            ? 'Google sign-in token'
            : field.charAt(0).toUpperCase() + field.slice(1);

  switch (issue.code) {
    case 'too_small':
      return typeof issue.minimum === 'number'
        ? `${label} must be at least ${issue.minimum} characters.`
        : `${label} is too short.`;
    case 'too_big':
      return typeof issue.maximum === 'number'
        ? `${label} must be ${issue.maximum} characters or fewer.`
        : `${label} is too long.`;
    case 'invalid_string':
      return issue.validation === 'email'
        ? 'That does not look like a valid email address.'
        : `${label} is not in a valid format.`;
    case 'invalid_type':
      return issue.received === 'undefined' ? `${label} is required.` : `${label} is not valid.`;
    case 'invalid_enum_value':
      return `${label} is not one of the allowed values.`;
    default:
      return issue.message ? `${label}: ${issue.message}` : `${label} is not valid.`;
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  // User input problems are 400s with a readable message — never a 500 with a JSON dump.
  if (err instanceof ZodError) {
    const message = humanizeZodError(err);
    logger.warn({ path: req.path, issues: err.issues }, 'Validation failed');
    res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body was not valid JSON.', code: 'BAD_JSON' });
    return;
  }

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = status === 500 ? 'Something went wrong on the server. Please try again.' : err.message || 'Request failed';

  if (status >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled error');
  } else {
    logger.warn({ err, path: req.path }, 'Request failed');
  }

  res.status(status).json({ error: message });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No API route matches ${req.method} ${req.originalUrl.split('?')[0]}` });
}
