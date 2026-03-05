import { BaseCommandHandler } from './BaseCommandHandler.js';
import { InlineKeyboard } from 'grammy';

/**
 * Handler for the deleteride command
 */
export class DeleteRideCommandHandler extends BaseCommandHandler {
  /**
   * Handle the deleteride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      ctx.t('commands.delete.onlyCreator')
    );
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    // Send confirmation message
    const confirmationMessage = this.messageFormatter.formatDeleteConfirmation();
    const keyboard = new InlineKeyboard()
      .text(ctx.t('buttons.confirmDelete'), `delete:confirm:${ride.id}`)
      .text(ctx.t('buttons.cancelDelete'), `delete:cancel:${ride.id}`);

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
      await ctx.editMessageText(ctx.t('commands.delete.cancelledMessage'));
      await ctx.answerCallbackQuery(ctx.t('commands.delete.cancelledCallback'));
      return;
    }
    
    // Get the ride and check if user is creator
    const ride = await this.rideService.getRide(rideId);
    if (!ride) {
      await ctx.editMessageText(ctx.t('commands.delete.notFoundMessage'));
      await ctx.answerCallbackQuery(ctx.t('commands.delete.notFoundCallback'));
      return;
    }
    
    if (!this.isRideCreator(ride, ctx.from.id)) {
      await ctx.answerCallbackQuery(ctx.t('commands.delete.onlyCreator'));
      return;
    }
    
    // Delete the ride
    const success = await this.rideService.deleteRide(rideId);
    
    if (success) {
      let deletedCount = 0;
      let removedCount = 0;
      if (ride.messages && ride.messages.length > 0) {
        for (const message of ride.messages) {
          try {
            await ctx.api.deleteMessage(message.chatId, message.messageId);
            deletedCount++;
          } catch (error) {
            removedCount++;
            console.error(`Error deleting ride message in chat ${message.chatId}:`, error);
          }
        }
      }
      let reply = ctx.t('commands.delete.successMessage');
      if (deletedCount > 0) {
        reply += ` ${ctx.t('commands.delete.deletedMessages', { count: deletedCount })}`;
      }
      if (removedCount > 0) {
        reply += ` ${ctx.t('commands.delete.removedMessages', { count: removedCount })}`;
      }
      await ctx.editMessageText(reply);
      await ctx.answerCallbackQuery(ctx.t('commands.delete.successCallback'));
    } else {
      await ctx.editMessageText(ctx.t('commands.delete.failedMessage'));
      await ctx.answerCallbackQuery(ctx.t('commands.delete.failedCallback'));
    }
  }
}
