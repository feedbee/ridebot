import { BaseCommandHandler } from './BaseCommandHandler.js';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';

/**
 * Handler for the deleteride command
 */
export class DeleteRideCommandHandler extends BaseCommandHandler {
  /**
   * Handle the deleteride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    const { ride, error } = await this.extractRide(ctx);
    if (error) {
      await ctx.reply(error);
      return;
    }
    
    if (!this.isRideCreator(ride, ctx.from.id)) {
      await ctx.reply('Only the ride creator can delete this ride.');
      return;
    }

    // Send confirmation message
    const confirmationMessage = this.messageFormatter.formatDeleteConfirmation();
    const keyboard = new InlineKeyboard()
      .text(config.buttons.confirmDelete, `delete:confirm:${ride.id}`)
      .text(config.buttons.cancelDelete, `delete:cancel:${ride.id}`);

    await ctx.reply(confirmationMessage, {
      reply_markup: keyboard
    });
  }

  /**
   * Handle delete confirmation
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleConfirmation(ctx) {
    const [_, action, rideId] = ctx.match;
    
    if (action === 'cancel') {
      await ctx.editMessageText('Deletion cancelled.');
      await ctx.answerCallbackQuery('Deletion cancelled');
      return;
    }
    
    // Get the ride and check if user is creator
    const ride = await this.rideService.getRide(rideId);
    if (!ride) {
      await ctx.editMessageText('Ride not found.');
      await ctx.answerCallbackQuery('Ride not found');
      return;
    }
    
    if (!this.isRideCreator(ride, ctx.from.id)) {
      await ctx.answerCallbackQuery('Only the ride creator can delete this ride.');
      return;
    }
    
    // Delete the ride
    const success = await this.rideService.deleteRide(rideId);
    
    if (success) {
      await ctx.editMessageText('Ride deleted successfully.');
      
      // Try to delete all ride messages
      if (ride.messages && ride.messages.length > 0) {
        for (const message of ride.messages) {
          try {
            await ctx.api.deleteMessage(message.chatId, message.messageId);
          } catch (error) {
            console.error(`Error deleting ride message in chat ${message.chatId}:`, error);
          }
        }
      }
      
      await ctx.answerCallbackQuery('Ride deleted successfully');
    } else {
      await ctx.editMessageText('Failed to delete ride.');
      await ctx.answerCallbackQuery('Failed to delete ride');
    }
  }
}
