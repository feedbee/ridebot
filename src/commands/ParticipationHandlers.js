import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for join/thinking/skip ride callbacks
 */
export class ParticipationHandlers extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/GroupManagementService.js').GroupManagementService} [groupManagementService]
   */
  constructor(rideService, messageFormatter, rideMessagesService, groupManagementService = null) {
    super(rideService, messageFormatter, rideMessagesService);
    this.groupManagementService = groupManagementService;
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
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideNotFound'));
        return;
      }
      
      if (ride.cancelled) {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideCancelled'));
        return;
      }
      
      const participant = {
        userId: ctx.from.id,
        username: ctx.from.username || '',
        firstName: ctx.from.first_name || '',
        lastName: ctx.from.last_name || ''
      };
      
      const result = await this.rideService.setParticipation(rideId, participant, state);

      if (result.success) {
        // Sync group membership if a group is attached
        if (result.ride.groupId && this.groupManagementService) {
          const groupId = result.ride.groupId;
          const userId = participant.userId;
          if (state === 'joined') {
            await this.groupManagementService.addParticipant(ctx.api, groupId, userId, ctx.lang);
          } else if (result.previousState === 'joined') {
            await this.groupManagementService.removeParticipant(ctx.api, groupId, userId);
          }
        }

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
