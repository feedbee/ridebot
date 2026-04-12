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
  }

  /**
   * Change participation state and run participation-related side effects.
   * @param {Object} params
   * @param {string} params.rideId
   * @param {import('../models/UserProfile.js').UserProfile} params.participantProfile
   * @param {'joined'|'thinking'|'skipped'} params.targetState
   * @param {string} [params.language]
   * @param {import('grammy').Api} params.api
   * @returns {Promise<{status: 'changed'|'ride_not_found'|'ride_cancelled'|'already_in_state', ride?: Object, previousState?: string|null, targetState: string}>}
   */
  async changeParticipation({ rideId, participantProfile, targetState, language, api }) {
    const ride = await this.rideService.getRide(rideId);
    if (!ride) {
      return { status: 'ride_not_found', targetState };
    }

    if (ride.cancelled) {
      return { status: 'ride_cancelled', ride, targetState };
    }

    const result = await this.rideService.setParticipation(rideId, participantProfile, targetState);
    if (!result.success) {
      return { status: 'already_in_state', targetState };
    }

    if (this.notificationService) {
      this.notificationService.scheduleParticipationNotification(result.ride, participantProfile, targetState, api);
    }

    if (result.ride.groupId && this.groupManagementService) {
      if (targetState === 'joined') {
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

    return {
      status: 'changed',
      ride: result.ride,
      previousState: result.previousState,
      targetState
    };
  }
}
