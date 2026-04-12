import { BaseCommandHandler } from './BaseCommandHandler.js';
import { UserProfile } from '../models/UserProfile.js';

/**
 * Handler for join/thinking/skip ride callbacks
 */
export class ParticipationHandlers extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/RideParticipationService.js').RideParticipationService} rideParticipationService
   */
  constructor(rideService, messageFormatter, rideMessagesService, rideParticipationService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.rideParticipationService = rideParticipationService;
  }
  /**
   * Handle join ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleJoinRide(ctx) {
    await this.handleParticipationChange(ctx, 'joined', this.translate(ctx, 'commands.participation.joinedSuccess'));
  }

  /**
   * Handle thinking ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleThinkingRide(ctx) {
    await this.handleParticipationChange(ctx, 'thinking', this.translate(ctx, 'commands.participation.thinkingSuccess'));
  }

  /**
   * Handle skip ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleSkipRide(ctx) {
    await this.handleParticipationChange(ctx, 'skipped', this.translate(ctx, 'commands.participation.skippedSuccess'));
  }

  /**
   * Handle participation state change
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {string} state - The participation state (joined, thinking, skipped)
   * @param {string} successMessage - Message to show on success
   */
  async handleParticipationChange(ctx, state, successMessage) {
    const rideId = ctx.match[1];
    
    try {
      const participantProfile = UserProfile.fromTelegramUser(ctx.from);
      const result = await this.rideParticipationService.changeParticipation({
        rideId,
        participantProfile,
        targetState: state,
        language: ctx.lang,
        api: ctx.api
      });

      if (result.status === 'ride_not_found') {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideNotFound'));
        return;
      }

      if (result.status === 'ride_cancelled') {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideCancelled'));
        return;
      }

      if (result.status === 'changed') {
        const result2 = await this.updateRideMessage(result.ride, ctx);
        
        if (result2.success) {
          await ctx.answerCallbackQuery(successMessage);
        } else {
          await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.updatedButMessageFailed'));
        }
      } else {
        const stateLabel = this.translate(ctx, `commands.participation.states.${state}`);
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.alreadyInState', { state: stateLabel }));
      }
    } catch (error) {
      console.error(`Error updating participation to ${state}:`, error);
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.genericError'));
    }
  }
}
