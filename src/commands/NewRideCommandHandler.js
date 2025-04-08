import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the newride command
 */
export class NewRideCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../wizard/RideWizard.js').RideWizard} wizard
   */
  constructor(rideService, messageFormatter, wizard) {
    super(rideService, messageFormatter);
    this.wizard = wizard;
  }

  /**
   * Handle the newride command
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} prefillData - Optional data to prefill
   */
  async handle(ctx, prefillData = null) {
    // If parameters are provided, use the parameter-based approach
    if (ctx.message.text.includes('\n')) {
      const params = this.rideService.parseRideParams(ctx.message.text);
      return this.handleWithParams(ctx, params);
    }

    // Otherwise start the wizard
    await this.wizard.startWizard(ctx, prefillData);
  }

  /**
   * Handle the newride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, params) {
    const { ride, error } = await this.rideService.createRideFromParams(
      params, 
      ctx.chat.id, 
      ctx.from.id
    );

    if (error) {
      await ctx.reply(error);
      return;
    }
    
    // Create initial message using the centralized formatter
    const participants = await this.rideService.getParticipants(ride.id);
    const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants);
    
    // Prepare reply options
    const replyOptions = {
      parse_mode: parseMode,
      reply_markup: keyboard
    };
    
    // If the message is in a topic, include the message_thread_id
    if (ctx.message && ctx.message.message_thread_id) {
      replyOptions.message_thread_id = ctx.message.message_thread_id;
    }
    
    const sentMessage = await ctx.reply(message, replyOptions);

    // Prepare the message data for storage
    const messageData = {
      messageId: sentMessage.message_id,
      chatId: ctx.chat.id
    };
    
    // Include message thread ID if present
    if (ctx.message && ctx.message.message_thread_id) {
      messageData.messageThreadId = ctx.message.message_thread_id;
    }

    // Update the ride with the message info in the messages array
    await this.rideService.updateRide(ride.id, {
      messages: [messageData]
    });
  }
}
