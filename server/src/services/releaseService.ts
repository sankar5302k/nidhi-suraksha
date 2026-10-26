import mongoose from 'mongoose';
import { Fdr, IFdr } from '../models/fdr.js';
import { ReleaseRequest, IReleaseRequest } from '../models/releaseRequest.js';
import { assertTransition } from './fdrStateMachine.js';
import { recordAuditLog } from './auditService.js';
import { checkFdrAccess } from '../utils/authz.js';
import { AuthenticatedUser } from '../types/auth.js';

export class ReleaseWorkflowError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ReleaseWorkflowError';
    this.statusCode = statusCode;
  }
}

/**
 * Institution initiates a formal security deposit release request
 */
export async function createReleaseRequest(
  fdrId: string,
  user: AuthenticatedUser,
  reason: string
): Promise<{ releaseRequest: IReleaseRequest; fdr: IFdr }> {
  const fdr = await Fdr.findById(fdrId);
  checkFdrAccess(user, fdr);

  if (!fdr) {
    throw new ReleaseWorkflowError('FDR record not found', 404);
  }

  // Can only request release for ACTIVE, EXPIRING, or MATURED deposits
  if (!['ACTIVE', 'EXPIRING', 'MATURED'].includes(fdr.status)) {
    throw new ReleaseWorkflowError(
      `Cannot request release for an FDR in '${fdr.status}' status. Only verified ACTIVE, EXPIRING, or MATURED deposits can be released.`,
      409
    );
  }

  // Check if there is an existing pending request
  const existingPending = await ReleaseRequest.findOne({
    fdrId: fdr._id,
    status: mongoose.trusted({ $in: ['PENDING_OFFICER_REVIEW', 'RECOMMENDED_FOR_APPROVAL'] })
  });

  if (existingPending) {
    throw new ReleaseWorkflowError('A release request is already active and pending processing for this FDR.', 409);
  }

  assertTransition(fdr.status, 'RELEASE_REQUESTED');
  const prevStatus = fdr.status;
  fdr.status = 'RELEASE_REQUESTED';
  fdr.history.push({
    action: 'RELEASE_REQUESTED',
    actorId: user.id,
    actorRole: user.role,
    timestamp: new Date(),
    note: reason
  });
  await fdr.save();

  const releaseReq = new ReleaseRequest({
    fdrId: fdr._id,
    institutionId: fdr.institutionId,
    reason,
    status: 'PENDING_OFFICER_REVIEW',
    requestedBy: user.id
  });
  await releaseReq.save();

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'RELEASE_REQUEST_INITIATED',
    entityType: 'RELEASE_REQUEST',
    entityId: releaseReq.id,
    before: { fdrStatus: prevStatus },
    after: { fdrId: fdr.id, fdrStatus: fdr.status, reason }
  }).catch(() => {});

  return { releaseRequest: releaseReq, fdr };
}

/**
 * Scrutiny Officer processes and reviews the release request
 */
export async function processReleaseRequest(
  requestId: string,
  user: AuthenticatedUser,
  decision: 'RECOMMEND' | 'REJECT',
  officerNotes?: string
): Promise<{ releaseRequest: IReleaseRequest; fdr: IFdr }> {
  const releaseReq = await ReleaseRequest.findById(requestId);
  if (!releaseReq) {
    throw new ReleaseWorkflowError('Release request not found', 404);
  }

  if (releaseReq.status !== 'PENDING_OFFICER_REVIEW') {
    throw new ReleaseWorkflowError(
      `Cannot process release request in '${releaseReq.status}' status. Must be PENDING_OFFICER_REVIEW.`,
      409
    );
  }

  const fdr = await Fdr.findById(releaseReq.fdrId);
  if (!fdr) {
    throw new ReleaseWorkflowError('Associated FDR not found', 404);
  }

  if (decision === 'RECOMMEND') {
    releaseReq.status = 'RECOMMENDED_FOR_APPROVAL';
    releaseReq.processedBy = user.id;
    releaseReq.processedAt = new Date();
    releaseReq.officerNotes = officerNotes || 'Recommended for authorized release';
    await releaseReq.save();

    fdr.history.push({
      action: 'RELEASE_RECOMMENDED',
      actorId: user.id,
      actorRole: user.role,
      timestamp: new Date(),
      note: officerNotes
    });
    await fdr.save();
  } else {
    // Rejection by officer: revert FDR back to ACTIVE
    releaseReq.status = 'REJECTED';
    releaseReq.processedBy = user.id;
    releaseReq.processedAt = new Date();
    releaseReq.officerNotes = officerNotes || 'Release request rejected by Scrutiny Officer';
    await releaseReq.save();

    assertTransition(fdr.status, 'ACTIVE');
    fdr.status = 'ACTIVE';
    fdr.history.push({
      action: 'RELEASE_REJECTED_BY_OFFICER',
      actorId: user.id,
      actorRole: user.role,
      timestamp: new Date(),
      note: officerNotes
    });
    await fdr.save();
  }

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: decision === 'RECOMMEND' ? 'RELEASE_RECOMMENDED' : 'RELEASE_REJECTED_BY_OFFICER',
    entityType: 'RELEASE_REQUEST',
    entityId: releaseReq.id,
    after: { status: releaseReq.status, officerNotes }
  }).catch(() => {});

  return { releaseRequest: releaseReq, fdr };
}

/**
 * Approving Authority decides on the release request (Hard separation of duties enforced)
 */
export async function decideReleaseRequest(
  requestId: string,
  user: AuthenticatedUser,
  decision: 'APPROVE' | 'REJECT',
  decisionNotes?: string
): Promise<{ releaseRequest: IReleaseRequest; fdr: IFdr }> {
  const releaseReq = await ReleaseRequest.findById(requestId);
  if (!releaseReq) {
    throw new ReleaseWorkflowError('Release request not found', 404);
  }

  if (releaseReq.status !== 'RECOMMENDED_FOR_APPROVAL') {
    throw new ReleaseWorkflowError(
      `Cannot make final decision on release request in '${releaseReq.status}' status. It must be RECOMMENDED_FOR_APPROVAL.`,
      409
    );
  }

  // ==============================================================================
  // CRITICAL SECURITY CONTROL: Separation of Duties
  // The Approving Authority CANNOT approve or decide on a release request they processed as an officer!
  // ==============================================================================
  if (releaseReq.processedBy === user.id) {
    throw new ReleaseWorkflowError(
      'Separation of Duties violation: The Approving Authority cannot make a final release decision on a request they previously processed or recommended.',
      403
    );
  }

  const fdr = await Fdr.findById(releaseReq.fdrId);
  if (!fdr) {
    throw new ReleaseWorkflowError('Associated FDR not found', 404);
  }

  if (decision === 'APPROVE') {
    releaseReq.status = 'APPROVED';
    releaseReq.decidedBy = user.id;
    releaseReq.decidedAt = new Date();
    releaseReq.decisionNotes = decisionNotes || 'Security deposit release approved by Authority';
    await releaseReq.save();

    assertTransition(fdr.status, 'RELEASED');
    fdr.status = 'RELEASED';
    fdr.history.push({
      action: 'RELEASE_APPROVED',
      actorId: user.id,
      actorRole: user.role,
      timestamp: new Date(),
      note: decisionNotes
    });
    await fdr.save();
  } else {
    releaseReq.status = 'REJECTED';
    releaseReq.decidedBy = user.id;
    releaseReq.decidedAt = new Date();
    releaseReq.decisionNotes = decisionNotes || 'Security deposit release rejected by Authority';
    await releaseReq.save();

    assertTransition(fdr.status, 'ACTIVE');
    fdr.status = 'ACTIVE';
    fdr.history.push({
      action: 'RELEASE_REJECTED_BY_AUTHORITY',
      actorId: user.id,
      actorRole: user.role,
      timestamp: new Date(),
      note: decisionNotes
    });
    await fdr.save();
  }

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: decision === 'APPROVE' ? 'RELEASE_APPROVED' : 'RELEASE_REJECTED_BY_AUTHORITY',
    entityType: 'RELEASE_REQUEST',
    entityId: releaseReq.id,
    after: {
      status: releaseReq.status,
      fdrStatus: fdr.status,
      decisionNotes
    }
  }).catch(() => {});

  return { releaseRequest: releaseReq, fdr };
}
