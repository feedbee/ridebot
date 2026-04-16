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
   * Build the localized creator-only message for this state change.
   */
  getCreatorOnlyMessage(ctx) {
    const stateConfig = this.getStateConfig(ctx);
    return this.translate(ctx, 'commands.stateChange.onlyCreator', { action: stateConfig.actionVerb });
  }

  /**
   * Handle the ride state change command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    await this.handleWithMode(ctx, 'message');
  }

  /**
   * Handle owner action callback for a ride state change.
   */
  async handleCallback(ctx) {
    await this.handleWithMode(ctx, 'callback');
  }

  /**
   * Execute the state change flow for a specific Telegram entry-point mode.
   */
  async handleWithMode(ctx, mode) {
    const { ride, error } = await this.extractRide(ctx, mode);

    if (error) {
      await this.replyOrAnswerCallback(ctx, mode, error);
      return;
    }

    if (!this.isRideCreator(ride, ctx.from.id)) {
      await this.replyOrAnswerCallback(ctx, mode, this.getCreatorOnlyMessage(ctx));
      return;
    }

    const result = await this.performStateChange(ctx, ride);
    await this.replyOrAnswerCallback(ctx, mode, result.message);
  }

  /**
   * Execute the shared cancel/resume flow for an already loaded ride.
   */
  async performStateChange(ctx, ride) {
    const stateConfig = this.getStateConfig(ctx);

    if (!stateConfig.checkState(ride)) {
      return { ok: false, message: stateConfig.errorMessage };
    }

    const updatedRide = await this.rideService[stateConfig.serviceMethod](ride.id, ctx.from.id);
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      return {
        ok: true,
        message: this.formatUpdateResultMessage(ctx, result, stateConfig.successAction)
      };
    }

    console.error(`Error ${stateConfig.successAction} ride:`, result.error);
    return {
      ok: false,
      message: this.translate(ctx, 'commands.stateChange.messageUpdateError', { action: stateConfig.successAction })
    };
  }
}
