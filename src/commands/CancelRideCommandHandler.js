import { RideStateChangeHandler } from './RideStateChangeHandler.js';

/**
 * Handler for the cancelride command
 */
export class CancelRideCommandHandler extends RideStateChangeHandler {
  /**
   * Get the state check configuration for cancelling a ride
   * @returns {{checkState: function, errorMessage: string, serviceMethod: string, successAction: string, actionVerb: string}}
   */
  getStateConfig(ctx) {
    return {
      checkState: (ride) => !ride.cancelled,
      errorMessage: this.translate(ctx, 'commands.cancel.alreadyCancelled'),
      serviceMethod: 'cancelRide',
      successAction: this.translate(ctx, 'commands.common.actions.cancelled'),
      actionVerb: this.translate(ctx, 'commands.common.verbs.cancel')
    };
  }
}
