import { BaseCommandHandler } from './BaseCommandHandler.js';
import { RIDE_ARCHIVE_AFTER_HOURS } from '../services/ride-lifecycle.js';

/**
 * Abstract handler for ride state change operations (cancel/resume)
 * Reduces duplication between CancelRideCommandHandler and ResumeRideCommandHandler
 */
export class RideStateChangeHandler extends BaseCommandHandler {
  /**
   * Get the state check configuration
   * @returns {{errorMessage: string, serviceMethod: string, successAction: string, actionVerb: string}}
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

    let updatedRide;
    try {
      updatedRide = await this.rideService[stateConfig.serviceMethod](ride.id, ctx.from.id);
    } catch (error) {
      if (error.code === 'ride_archived') {
        return {
          ok: false,
          message: this.translate(ctx, 'commands.stateChange.rideArchived', {
            action: stateConfig.actionVerb, hours: RIDE_ARCHIVE_AFTER_HOURS
          })
        };
      }
      if (error.code === 'already_in_state') return { ok: false, message: stateConfig.errorMessage };
      throw error;
    }
    if (!updatedRide) return { ok: false, message: this.translate(ctx, 'commands.common.rideNotFoundById', { id: ride.id }) };
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
