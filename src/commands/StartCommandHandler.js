import { BaseCommandHandler } from './BaseCommandHandler.js';
import {
  buildExpandedMainMenuKeyboard,
  buildMainMenuKeyboard
} from '../telegram/MainMenuKeyboard.js';
import { replaceBotUsername } from '../utils/botUtils.js';

/**
 * Handler for the start command
 */
export class StartCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('./CalendarCommandHandler.js').CalendarCommandHandler} [calendarHandler]
   */
  constructor(rideService, messageFormatter, rideMessagesService, calendarHandler = null) {
    super(rideService, messageFormatter, rideMessagesService);
    this.calendarHandler = calendarHandler;
  }

  /**
   * Handle the start command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    if (this.calendarHandler && await this.calendarHandler.handleStartPayload(ctx, ctx.match)) {
      return;
    }

    const startMessage = await replaceBotUsername(ctx.t('templates.start'), ctx);
    await ctx.replyWithRichMessage(
      { html: startMessage },
      { reply_markup: buildMainMenuKeyboard(ctx) }
    );
  }

  /**
   * Show the expanded inline navigation panel.
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<void>}
   */
  async showButtons(ctx) {
    await ctx.reply(ctx.t('mainMenu.expandedPrompt'), {
      reply_markup: buildExpandedMainMenuKeyboard(ctx)
    });
  }

  /**
   * Close the expanded inline navigation panel.
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<void>}
   */
  async closeButtons(ctx) {
    await ctx.answerCallbackQuery();
    try {
      await ctx.deleteMessage();
    } catch (error) {
      const description = error?.description || error?.message || '';
      if (!description.includes('message to delete not found')) {
        throw error;
      }
    }
  }
}
