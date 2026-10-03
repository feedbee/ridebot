import { isRideArchived } from './ride-lifecycle.js';

/**
 * Application service for participation state changes and their side effects.
 */
export class RideParticipationService {
  /**
   * @param {import('./RideService.js').RideService} rideService
   * @param {import('./NotificationService.js').NotificationService|null} notificationService
   * @param {import('./GroupManagementService.js').GroupManagementService|null} groupManagementService
   */
  constructor(rideService, notificationService = null, groupManagementService = null) {
    this.rideService = rideService;
    this.notificationService = notificationService;
    this.groupManagementService = groupManagementService;
    this.participantOperations = new Map();
  }

  /** Serialize transitions and their side effects within this bot process.
   * @param {string} rideId
   * @param {number} userId
   * @param {function(): Promise<Object>} operation
   * @returns {Promise<Object>}
   */
  async runParticipantOperation(rideId, userId, operation) {
    const key = `${rideId}:${userId}`;
    const previous = this.participantOperations.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    this.participantOperations.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.participantOperations.get(key) === pending) this.participantOperations.delete(key);
    }
  }

  /**
   * Change participation state and run participation-related side effects.
   * @param {Object} params
   * @param {string} params.rideId
   * @param {import('../models/UserProfile.js').UserProfile} params.participantProfile
   * @param {'joined'|'thinking'|'skipped'} params.targetState
   * @param {string} [params.language]
   * @param {import('grammy').Api} params.api
   * @returns {Promise<{status: 'changed'|'ride_not_found'|'ride_archived'|'ride_cancelled'|'already_in_state'|'participant_limit_reached', ride?: Object, previousState?: string|null, targetState: string}>}
   */
  async changeParticipation(params) {
    return this.runParticipantOperation(params.rideId, params.participantProfile.userId,
      () => this.performParticipationChange(params));
  }

  /** Execute a participation transition while its participant queue is held.
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async performParticipationChange({ rideId, participantProfile, targetState, language, api }) {
    const ride = await this.rideService.getRide(rideId);
    if (!ride) {
      return { status: 'ride_not_found', targetState };
    }

    if (isRideArchived(ride)) {
      return { status: 'ride_archived', ride, targetState };
    }

    if (ride.cancelled) {
      return { status: 'ride_cancelled', ride, targetState };
    }

    const approvalRequired = ride.settings?.requireParticipationApproval === true;
    const isCreator = ride.createdBy === participantProfile.userId;
    const currentState = ['joined', 'thinking', 'skipped'].find(state =>
      (ride.participation?.[state] || []).some(p => p.userId === participantProfile.userId)
    ) || null;
    let effectiveTargetState = targetState;
    if (approvalRequired && targetState !== 'skipped') {
      effectiveTargetState = isCreator || currentState === 'joined' ? 'joined' : 'thinking';
    }
    const result = await this.rideService.setParticipationForRideMode(
      rideId,
      participantProfile,
      effectiveTargetState,
      approvalRequired,
      currentState
    );
    if (!result.success) {
      if (result.reason === 'ride_changed') {
        return { status: 'ride_changed', targetState: effectiveTargetState };
      }
      if (result.status === 'participant_limit_reached') {
        return { status: 'participant_limit_reached', targetState: effectiveTargetState };
      }
      const noOp = { status: 'already_in_state', targetState: effectiveTargetState };
      if (approvalRequired) {
        noOp.moderationOutcome = effectiveTargetState === 'skipped'
          ? 'already_not_participating'
          : currentState === 'thinking'
            ? 'application_pending'
            : 'already_accepted';
      }
      return noOp;
    }

    const isApplication = approvalRequired && !isCreator && effectiveTargetState === 'thinking';
    if (isApplication && this.notificationService) {
      await this.notificationService.sendApplicationNotification(result.ride, participantProfile, api);
    } else if (this.notificationService) {
      this.notificationService.scheduleParticipationNotification(
        result.ride,
        participantProfile,
        result.previousState,
        effectiveTargetState,
        api
      );
    }

    if (result.ride.groupId && this.groupManagementService) {
      if (effectiveTargetState === 'joined') {
        await this.groupManagementService.addParticipant(
          api,
          result.ride.groupId,
          participantProfile.userId,
          language,
          result.ride.createdBy
        );
      } else if (result.previousState === 'joined') {
        await this.groupManagementService.removeParticipant(api, result.ride.groupId, participantProfile.userId);
      }
    }

    const outcome = {
      status: 'changed',
      ride: result.ride,
      previousState: result.previousState,
      targetState: effectiveTargetState
    };
    if (isApplication) outcome.moderationOutcome = 'application_submitted';
    if (approvalRequired && effectiveTargetState === 'skipped') outcome.moderationOutcome = 'not_participating';
    return outcome;
  }

  /** Accept or reject a pending application. */
  async decideApplication(params) {
    return this.runParticipantOperation(params.rideId, params.applicantUserId,
      () => this.performApplicationDecision(params));
  }

  /** Execute an application decision while its participant queue is held.
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async performApplicationDecision({ rideId, applicantUserId, actorUserId, decision, language, api }) {
    if (!['accept', 'reject'].includes(decision)) return { status: 'invalid_decision' };
    const ride = await this.rideService.getRide(rideId);
    if (!ride) return { status: 'ride_not_found' };
    if (isRideArchived(ride)) return { status: 'ride_archived' };
    if (ride.cancelled) return { status: 'ride_cancelled' };
    if (ride.createdBy !== actorUserId) return { status: 'forbidden' };
    if (ride.settings?.requireParticipationApproval !== true) return { status: 'stale' };

    const applicant = (ride.participation?.thinking || []).find(p => p.userId === applicantUserId);
    if (!applicant) return { status: 'stale' };
    const targetState = decision === 'accept' ? 'joined' : 'skipped';
    const result = await this.rideService.decideParticipation(rideId, applicant, targetState);
    if (!result.success) {
      return { status: result.reason === 'participant_limit_reached' ? result.reason : 'stale' };
    }

    if (targetState === 'joined' && result.ride.groupId && this.groupManagementService) {
      await this.groupManagementService.addParticipant(
        api,
        result.ride.groupId,
        applicantUserId,
        language,
        result.ride.createdBy
      );
    } else if (targetState === 'skipped' && result.ride.groupId && this.groupManagementService) {
      await this.groupManagementService.removeParticipant(api, result.ride.groupId, applicantUserId);
    }
    if (this.notificationService) {
      await this.notificationService.sendApplicationDecisionNotification(
        result.ride,
        applicantUserId,
        targetState === 'joined' ? 'accepted' : 'rejected',
        api
      );
    }
    return { status: 'changed', ride: result.ride, targetState };
  }
}
