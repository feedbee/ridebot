import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the postride command
 * Allows reposting a ride to the current chat
 */
export class PostRideCommandHandler extends BaseCommandHandler {
  /**
   * Handle the postride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract the ride ID from the command
    const rideId = this.extractRideId(ctx.message.text);
    if (!rideId) {
      await ctx.reply('Please provide a valid ride ID. Usage: /postride [ride_id]');
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
      if (!this.rideService.isRideCreator(ride, ctx.from.id)) {
        await ctx.reply('Only the ride creator can repost this ride.');
        return;
      }

      if (ride.cancelled) {
        await ctx.reply('Cannot repost a cancelled ride.');
        return;
      }

      const currentChatId = ctx.chat.id;

      // Check if the ride is already posted in the current chat
      if (ride.messages && ride.messages.some(msg => msg.chatId === currentChatId)) {
        await ctx.reply(`This ride is already posted in this chat.`);
        return;
      }

      // Post the ride to the current chat
      const result = await this.postRideToChat(ride, currentChatId, ctx);
      
      if (!result.success) {
        await ctx.reply(`Failed to post ride: ${result.error}`);
      }
    } catch (error) {
      console.error('Error posting ride:', error);
      await ctx.reply('An error occurred while posting the ride.');
    }
  }

  /**
   * Extract ride ID from command text
   * @param {string} text - Command text
   * @returns {string|null} - Extracted ride ID or null if invalid
   */
  extractRideId(text) {
    // Format: /postride [ride_id]
    const parts = text.trim().split(/\s+/);
    if (parts.length !== 2) {
      return null;
    }

    return parts[1];
  }

  /**
   * Post a ride to the current chat
   * @param {Object} ride - Ride object
   * @param {number} chatId - Current chat ID
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{success: boolean, error: string|null}>} - Result
   */
  async postRideToChat(ride, chatId, ctx) {
    try {
      // Get participants to display in the message
      const participants = await this.rideService.getParticipants(ride.id);
      
      // Format the ride message
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants);
      
      // Send the message to the current chat
      const sentMessage = await ctx.reply(message, {
        parse_mode: parseMode,
        reply_markup: keyboard
      });
      
      // Add the new message to the ride's messages array
      const updatedRide = await this.rideService.updateRide(ride.id, {
        messages: [
          ...(ride.messages || []),
          {
            chatId: chatId,
            messageId: sentMessage.message_id
          }
        ]
      });
      
      return { success: true, error: null };
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
      
      return { success: false, error: 'An unexpected error occurred.' };
    }
  }
}
