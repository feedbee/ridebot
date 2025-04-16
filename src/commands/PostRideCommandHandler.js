import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the postride command
 * Allows reposting a ride to the current chat
 */
export class PostRideCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   */
  constructor(rideService, messageFormatter, rideMessagesService) {
    super(rideService, messageFormatter, rideMessagesService);
  }

  /**
   * Handle the postride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract the ride ID from the command
    const { rideId, error } = this.rideMessagesService.extractRideId(ctx.message);
    if (!rideId) {
      await ctx.reply(error || 'Please provide a valid ride ID. Usage: /postride rideID');
      return;
    }

    try {
      // Get the ride by ID
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        await ctx.reply(`Ride #${rideId} not found.`);
        return;
      }

      // Only allow the ride creator to repost
      if (!this.isRideCreator(ride, ctx.from.id)) {
        await ctx.reply('Only the ride creator can repost this ride.');
        return;
      }

      if (ride.cancelled) {
        await ctx.reply('Cannot repost a cancelled ride.');
        return;
      }

      const currentChatId = ctx.chat.id;
      const currentThreadId = ctx.message.message_thread_id || null;

      // Check if the ride is already posted in the current chat and topic
      if (ride.messages && ride.messages.some(msg => 
        msg.chatId === currentChatId && 
        (msg.messageThreadId || null) === currentThreadId
      )) {
        await ctx.reply(`This ride is already posted in this chat${currentThreadId ? ' topic' : ''}.`, {
          message_thread_id: currentThreadId
        });
        return;
      }

      // Post the ride to the current chat
      const result = await this.postRideToChat(ride, ctx);
      
      if (!result.success) {
        await ctx.reply(`Failed to post ride: ${result.error}`);
      }
    } catch (error) {
      console.error('Error posting ride:', error);
      await ctx.reply('An error occurred while posting the ride.');
    }
  }

  /**
   * Post a ride to the current chat
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{success: boolean, error: string|null}>} - Result
   */
  async postRideToChat(ride, ctx) {
    try {
      const result = await this.rideMessagesService.createRideMessage(ride, ctx, ctx.message?.message_thread_id);
      return { success: true };
    } catch (error) {
      console.error('Error posting ride to chat:', error);
      
      // Handle common errors
      if (error.description) {
        if (error.description.includes('bot was blocked')) {
          return { success: false, error: 'The bot is not a member of this chat or was blocked.' };
        } else if (error.description.includes('not enough rights')) {
          return { success: false, error: 'The bot does not have permission to send messages in this chat.' };
        }
      }
      
      return { success: false, error: 'Failed to post ride' };
    }
  }
}
