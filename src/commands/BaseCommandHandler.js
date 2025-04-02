/**
 * Base class for command handlers
 */
export class BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   */
  constructor(rideService, messageFormatter) {
    this.rideService = rideService;
    this.messageFormatter = messageFormatter;
  }

  /**
   * Handle a command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    throw new Error('Method not implemented');
  }

  /**
   * Extract and validate ride
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {boolean} requireCreator - Whether the command requires ride creator permissions
   * @returns {Promise<{ride: Object|null, error: string|null}>}
   */
  async extractRide(ctx, requireCreator = false) {
    const { rideId, error } = this.rideService.extractRideId(ctx.message);
    
    if (error) {
      return { ride: null, error };
    }

    try {
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        return { ride: null, error: `Ride #${rideId} not found` };
      }

      if (requireCreator && !this.rideService.isRideCreator(ride, ctx.from.id)) {
        return { ride: null, error: 'Only the ride creator can perform this action' };
      }

      return { ride, error: null };
    } catch (error) {
      console.error('Error extracting ride:', error);
      return { ride: null, error: 'Error accessing ride data' };
    }
  }
  
  /**
   * Update the ride message
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async updateRideMessage(ride, ctx) {
    // If no messages to update, return early
    if (!ride.messages || ride.messages.length === 0) {
      return;
    }

    try {
      const participants = await this.rideService.getParticipants(ride.id);
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants);
      
      // Update all messages for this ride
      for (const messageInfo of ride.messages) {
        try {
          await ctx.api.editMessageText(
            messageInfo.chatId,
            messageInfo.messageId,
            message,
            {
              parse_mode: parseMode,
              reply_markup: keyboard
            }
          );
        } catch (messageError) {
          console.error(`Error updating message in chat ${messageInfo.chatId}:`, messageError);
          // Continue with other messages even if one fails
        }
      }
    } catch (error) {
      console.error('Error updating ride messages:', error);
    }
  }
}
