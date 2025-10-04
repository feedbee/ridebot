import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for join/leave ride callbacks
 */
export class ParticipationHandlers extends BaseCommandHandler {
  /**
   * Handle join ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleJoinRide(ctx) {
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
      
      const result = await this.rideService.joinRide(rideId, participant);
      
      if (result.success) {
        const result2 = await this.updateRideMessage(result.ride, ctx);
        
        if (result2.success) {
          await ctx.answerCallbackQuery('You have joined the ride!');
        } else {
          await ctx.answerCallbackQuery('You joined the ride, but message updates failed');
        }
      } else {
        await ctx.answerCallbackQuery('You are already in this ride');
      }
    } catch (error) {
      console.error('Error joining ride:', error);
      await ctx.answerCallbackQuery('An error occurred');
    }
  }

  /**
   * Handle leave ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleLeaveRide(ctx) {
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
      
      const result = await this.rideService.leaveRide(rideId, participant);
      
      if (result.success) {
        const result2 = await this.updateRideMessage(result.ride, ctx);
        
        if (result2.success) {
          await ctx.answerCallbackQuery('You have left the ride');
        } else {
          await ctx.answerCallbackQuery('You left the ride, but message updates failed');
        }
      } else {
        await ctx.answerCallbackQuery('You are not in this ride');
      }
    } catch (error) {
      console.error('Error leaving ride:', error);
      await ctx.answerCallbackQuery('An error occurred');
    }
  }
}
