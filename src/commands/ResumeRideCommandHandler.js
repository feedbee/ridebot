import { RideStateChangeHandler } from './RideStateChangeHandler.js';

/**
 * Handler for the resumeride command
 */
export class ResumeRideCommandHandler extends RideStateChangeHandler {
  /**
   * Get the state check configuration for resuming a ride
   * @returns {{checkState: function, errorMessage: string, serviceMethod: string, successAction: string, actionVerb: string}}
   */
  getStateConfig() {
    return {
      checkState: (ride) => ride.cancelled,
      errorMessage: 'This ride is not cancelled.',
      serviceMethod: 'resumeRide',
      successAction: 'resumed',
      actionVerb: 'resume'
    };
  }
}
