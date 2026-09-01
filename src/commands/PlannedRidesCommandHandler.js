import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { DateParser } from '../utils/date-parser.js';

/**
 * Handler for the planned rides command.
 */
export class PlannedRidesCommandHandler extends BaseCommandHandler {
  /**
   * Handle the planned command.
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<void>}
   */
  async handle(ctx) {
    await this.showRidesList(ctx, 1);
  }

  /**
   * Handle a pagination callback.
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<void>}
   */
  async handleCallback(ctx) {
    await this.showRidesList(ctx, Number.parseInt(ctx.match[1], 10), true);
    await ctx.answerCallbackQuery();
  }

  /**
   * Close the planned rides list.
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<void>}
   */
  async handleClose(ctx) {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage();
  }

  /**
   * Render a page of planned rides.
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {number} requestedPage - Requested page number
   * @param {boolean} isEdit - Whether to edit the current message
   * @returns {Promise<void>}
   */
  async showRidesList(ctx, requestedPage, isEdit = false) {
    const limit = 5;
    const startOfToday = DateParser.startOfDay();
    let page = Math.max(1, requestedPage);
    let skip = (page - 1) * limit;
    let result = await this.rideService.getPlannedRides(ctx.from.id, startOfToday, skip, limit);
    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    if (page > totalPages) {
      page = totalPages;
      skip = (page - 1) * limit;
      result = await this.rideService.getPlannedRides(ctx.from.id, startOfToday, skip, limit);
    }

    const startNumber = result.rides.length > 0 ? skip + 1 : 0;
    const message = this.messageFormatter.formatPlannedRidesList(
      result.rides,
      ctx.from.id,
      page,
      totalPages,
      startNumber,
      ctx.lang
    );
    const keyboard = new InlineKeyboard();

    if (page > 1) {
      keyboard.text(ctx.t('buttons.previous'), `planned:list:${page - 1}`);
    }
    if (page < totalPages) {
      keyboard.text(ctx.t('buttons.next'), `planned:list:${page + 1}`);
    }
    if (keyboard.inline_keyboard.some(row => row.length > 0)) {
      keyboard.row();
    }
    keyboard.text(ctx.t('buttons.close'), 'planned:list:close');

    const options = { reply_markup: keyboard };
    if (isEdit) {
      await ctx.editMessageText({ html: message }, options);
    } else {
      await ctx.replyWithRichMessage({ html: message }, options);
    }
  }
}
