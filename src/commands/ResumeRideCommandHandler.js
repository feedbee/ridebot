import { RideStateChangeHandler } from './RideStateChangeHandler.js';

/**
 * Handler for the resumeride command
 */
export class ResumeRideCommandHandler extends RideStateChangeHandler {
  /**
   * Get the state check configuration for resuming a ride
   * @returns {{checkState: function, errorMessage: string, serviceMethod: string, successAction: string, actionVerb: string}}
   */
  getStateConfig(ctx) {
    return {
      checkState: (ride) => ride.cancelled,
      errorMessage: this.translate(ctx, 'commands.resume.notCancelled'),
      serviceMethod: 'resumeRide',
      successAction: this.translate(ctx, 'commands.common.actions.resumed'),
      actionVerb: this.translate(ctx, 'commands.common.verbs.resume')
    };
  }
}
