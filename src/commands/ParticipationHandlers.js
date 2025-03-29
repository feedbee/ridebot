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
        username: ctx.from.username || `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim()
      };
      
      const success = await this.rideService.addParticipant(rideId, participant);
      
      if (success) {
        await this.updateRideMessage(ride, ctx);
        await ctx.answerCallbackQuery('You have joined the ride!');
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
      
      const success = await this.rideService.removeParticipant(rideId, ctx.from.id);
      
      if (success) {
        await this.updateRideMessage(ride, ctx);
        await ctx.answerCallbackQuery('You have left the ride');
      } else {
        await ctx.answerCallbackQuery('You are not in this ride');
      }
    } catch (error) {
      console.error('Error leaving ride:', error);
      await ctx.answerCallbackQuery('An error occurred');
    }
  }

  /**
   * Update the ride message
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async updateRideMessage(ride, ctx) {
    if (!ride.messageId || !ride.chatId) {
      return;
    }

    try {
      const participants = await this.rideService.getParticipants(ride.id);
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants, ctx.from.id);
      
      await ctx.api.editMessageText(
        ride.chatId,
        ride.messageId,
        message,
        {
          parse_mode: parseMode,
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error('Error updating ride message:', error);
    }
  }
}
