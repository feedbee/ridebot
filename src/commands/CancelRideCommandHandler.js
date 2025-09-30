import { RideStateChangeHandler } from './RideStateChangeHandler.js';

/**
 * Handler for the cancelride command
 */
export class CancelRideCommandHandler extends RideStateChangeHandler {
  /**
   * Get the state check configuration for cancelling a ride
   * @returns {{checkState: function, errorMessage: string, serviceMethod: string, successAction: string, actionVerb: string}}
   */
  getStateConfig() {
    return {
      checkState: (ride) => !ride.cancelled,
      errorMessage: 'This ride is already cancelled.',
      serviceMethod: 'cancelRide',
      successAction: 'cancelled',
      actionVerb: 'cancel'
    };
  }
}
