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
    const stateConfig = this.getStateConfig(ctx);
    
    // Extract ride and validate creator
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      this.translate(ctx, 'commands.stateChange.onlyCreator', { action: stateConfig.actionVerb })
    );
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    // Check current state
    if (!stateConfig.checkState(ride)) {
      await ctx.reply(stateConfig.errorMessage);
      return;
    }

    // Perform state change
    const updatedRide = await this.rideService[stateConfig.serviceMethod](ride.id, ctx.from.id);
    
    // Update the ride message
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      const reply = this.formatUpdateResultMessage(ctx, result, stateConfig.successAction);
      await ctx.reply(reply);
    } else {
      await ctx.reply(
        this.translate(ctx, 'commands.stateChange.messageUpdateError', { action: stateConfig.successAction })
      );
      console.error(`Error ${stateConfig.successAction} ride:`, result.error);
    }
  }
}
