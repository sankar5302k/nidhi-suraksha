import { AuthenticatedUser } from '../types/auth.js';
import { IFdr } from '../models/fdr.js';

export class AuthorizationError extends Error {
  statusCode: number;
  constructor(message = 'Resource not found', statusCode = 404) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
  }
}

/**
 * Builds an authorized MongoDB filter for FDR queries.
 * Strictly enforces that INSTITUTION users can ONLY query records matching their own institutionId.
 * For external or administrative roles, allows querying all or filtering by a specific institution.
 */
export function buildFdrQueryFilter(
  user: AuthenticatedUser,
  additionalFilters: Record<string, unknown> = {}
): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...additionalFilters };

  if (user.role === 'INSTITUTION') {
    if (!user.institutionId) {
      throw new AuthorizationError('Institution profile has no associated institutionId', 404);
    }
    // Hard override institutionId to prevent IDOR parameter manipulation
    filter.institutionId = user.institutionId;
  }

  return filter;
}

/**
 * Validates object-level access to a specific FDR document.
 * Returns 404 (not 403) if an INSTITUTION tries to access another institution's FDR,
 * preventing attackers from enumerating valid IDs via oracle responses.
 */
export function checkFdrAccess(user: AuthenticatedUser, fdr: IFdr | null): IFdr {
  if (!fdr) {
    throw new AuthorizationError('FDR record not found', 404);
  }

  if (user.role === 'INSTITUTION') {
    if (!user.institutionId || fdr.institutionId !== user.institutionId) {
      // Must return 404, not 403, to conceal the existence of the resource
      throw new AuthorizationError('FDR record not found', 404);
    }
  }

  return fdr;
}
