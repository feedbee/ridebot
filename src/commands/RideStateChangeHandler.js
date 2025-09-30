import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Abstract handler for ride state change operations (cancel/resume)
 * Reduces duplication between CancelRideCommandHandler and ResumeRideCommandHandler
 */
export class RideStateChangeHandler extends BaseCommandHandler {
  /**
   * Get the state check configuration
   * @returns {{checkState: function, errorMessage: string, serviceMethod: string, successAction: string, actionVerb: string}}
   */
  getStateConfig() {
    throw new Error('getStateConfig() must be implemented by subclass');
  }

  /**
   * Handle the ride state change command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    const config = this.getStateConfig();
    
    // Extract ride and validate creator
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      `Only the ride creator can ${config.actionVerb} this ride.`
    );
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    // Check current state
    if (!config.checkState(ride)) {
      await ctx.reply(config.errorMessage);
      return;
    }

    // Perform state change
    const updatedRide = await this.rideService[config.serviceMethod](ride.id, ctx.from.id);
    
    // Update the ride message
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      const reply = this.formatUpdateResultMessage(result, config.successAction);
      await ctx.reply(reply);
    } else {
      await ctx.reply(
        `Ride has been ${config.successAction}, but there was an error updating the ride message. You may need to create a new ride message.`
      );
      console.error(`Error ${config.successAction} ride:`, result.error);
    }
  }
}
