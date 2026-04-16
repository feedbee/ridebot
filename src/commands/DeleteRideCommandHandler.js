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
    await this.handleDeleteEntry(ctx, 'message');
  }

  /**
   * Handle owner action callback for ride deletion.
   */
  async handleCallback(ctx) {
    await this.handleDeleteEntry(ctx, 'callback');
  }

  /**
   * Start the delete flow for the selected Telegram entry-point mode.
   */
  async handleDeleteEntry(ctx, responseMode) {
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.delete.onlyCreator',
      responseMode
    );

    if (error) {
      await this.replyOrAnswerCallback(ctx, responseMode, error);
      return;
    }

    await this.sendDeleteConfirmation(ctx, ride, responseMode);

    if (responseMode === 'callback') {
      await ctx.answerCallbackQuery();
    }
  }

  /**
   * Send the standard delete confirmation UX for a loaded ride.
   */
  async sendDeleteConfirmation(ctx, ride, responseMode = 'message') {
    const confirmationMessage = this.messageFormatter.formatDeleteConfirmation();
    const keyboard = new InlineKeyboard()
      .text(ctx.t('buttons.confirmDelete'), `delete:confirm:${ride.id}:${responseMode}`)
      .text(ctx.t('buttons.cancelDelete'), `delete:cancel:${ride.id}:${responseMode}`);

    await ctx.reply(confirmationMessage, {
      reply_markup: keyboard
    });
  }

  /**
   * Handle delete confirmation
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleConfirmation(ctx) {
    const [_, action, rideId, responseMode = 'message'] = ctx.match;
    
    if (action === 'cancel') {
      await this.finishConfirmation(ctx, responseMode, this.translate(ctx, 'commands.delete.cancelled'));
      return;
    }

    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.delete.onlyCreator',
      'callback',
      2
    );

    if (error) {
      const message = error === this.translate(ctx, 'commands.common.rideNotFoundById', { id: rideId })
        ? this.translate(ctx, 'commands.delete.notFound')
        : error;
      await this.finishConfirmation(ctx, responseMode, message);
      return;
    }

    // Delete the ride
    const success = await this.rideService.deleteRide(rideId);
    
    if (!success) {
      await this.finishConfirmation(ctx, responseMode, this.translate(ctx, 'commands.delete.failed'));
      return;
    }

    const resultMessage = await this.buildDeleteResultMessage(ctx, ride);
    await this.finishConfirmation(ctx, responseMode, resultMessage);
  }

  /**
   * Delete all tracked ride messages and build the final user-facing result text.
   */
  async buildDeleteResultMessage(ctx, ride) {
    const { deletedCount, removedCount } = await this.deleteTrackedMessages(ctx, ride.messages || []);
    let message = this.translate(ctx, 'commands.delete.success');

    if (deletedCount > 0) {
      message += ` ${this.translate(ctx, 'commands.delete.deletedMessages', { count: deletedCount })}`;
    }

    if (removedCount > 0) {
      message += ` ${this.translate(ctx, 'commands.delete.removedMessages', { count: removedCount })}`;
    }

    return message;
  }

  /**
   * Delete tracked ride messages, keeping count of deleted and unavailable ones.
   */
  async deleteTrackedMessages(ctx, messages) {
    let deletedCount = 0;
    let removedCount = 0;

    for (const message of messages) {
      try {
        await ctx.api.deleteMessage(message.chatId, message.messageId);
        deletedCount++;
      } catch (error) {
        removedCount++;
        console.error(`Error deleting ride message in chat ${message.chatId}:`, error);
      }
    }

    return { deletedCount, removedCount };
  }

  /**
   * Finish the delete confirmation flow for command-origin and button-origin entry points.
   */
  async finishConfirmation(ctx, responseMode, message) {
    await this.deleteConfirmationMessage(ctx);

    if (responseMode === 'callback') {
      await ctx.answerCallbackQuery(message);
      return;
    }

    await ctx.reply(message);
    await ctx.answerCallbackQuery();
  }

  /**
   * Remove the inline confirmation message once the callback is resolved.
   */
  async deleteConfirmationMessage(ctx) {
    try {
      if (typeof ctx.deleteMessage === 'function') {
        await ctx.deleteMessage();
        return;
      }

      const chatId = ctx.callbackQuery?.message?.chat?.id ?? ctx.chat?.id;
      const messageId = ctx.callbackQuery?.message?.message_id ?? ctx.msg?.message_id;
      if (chatId && messageId) {
        await ctx.api.deleteMessage(chatId, messageId);
      }
    } catch (error) {
      console.error('Error deleting delete-confirmation message:', error);
    }
  }
}
