import { FdrStatus } from '../models/fdr.js';

export class InvalidStateTransitionError extends Error {
  statusCode = 409;
  constructor(from: FdrStatus, to: FdrStatus) {
    super(`Illegal state transition from '${from}' to '${to}'.`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Explicit state machine transitions for Security Deposits / FDRs
 */
export const VALID_TRANSITIONS: Record<FdrStatus, FdrStatus[]> = {
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_SCRUTINY', 'REJECTED'],
  UNDER_SCRUTINY: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['EXPIRING', 'MATURED', 'RELEASE_REQUESTED', 'RENEWED'],
  EXPIRING: ['MATURED', 'RENEWED', 'RELEASE_REQUESTED', 'ACTIVE'],
  MATURED: ['RENEWED', 'RELEASE_REQUESTED'],
  RENEWED: [], // Terminal for parent FDR
  RELEASE_REQUESTED: ['RELEASED', 'ACTIVE'], // Reverted to ACTIVE if release is rejected
  RELEASED: [], // Terminal
  REJECTED: ['DRAFT'] // Allowed to be re-drafted for correction
};

export function canTransition(from: FdrStatus, to: FdrStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function assertTransition(from: FdrStatus, to: FdrStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
