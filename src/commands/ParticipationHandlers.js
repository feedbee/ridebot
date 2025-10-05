import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for join/thinking/skip ride callbacks
 */
export class ParticipationHandlers extends BaseCommandHandler {
  /**
   * Handle join ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleJoinRide(ctx) {
    await this.handleParticipationChange(ctx, 'joined', 'You have joined the ride!');
  }

  /**
   * Handle thinking ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleThinkingRide(ctx) {
    await this.handleParticipationChange(ctx, 'thinking', 'You are thinking about this ride');
  }

  /**
   * Handle skip ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleSkipRide(ctx) {
    await this.handleParticipationChange(ctx, 'skipped', 'You have passed on this ride');
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
        await ctx.answerCallbackQuery('Ride not found');
        return;
      }
      
      if (ride.cancelled) {
        await ctx.answerCallbackQuery('This ride has been cancelled');
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
        const result2 = await this.updateRideMessage(result.ride, ctx);
        
        if (result2.success) {
          await ctx.answerCallbackQuery(successMessage);
        } else {
          await ctx.answerCallbackQuery(`Your participation was updated, but message updates failed`);
        }
      } else {
        await ctx.answerCallbackQuery(`You are already ${state} for this ride`);
      }
    } catch (error) {
      console.error(`Error updating participation to ${state}:`, error);
      await ctx.answerCallbackQuery('An error occurred');
    }
  }
}
