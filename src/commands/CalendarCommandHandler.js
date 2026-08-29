import { InlineKeyboard, InputFile } from 'grammy';
import { getBotUsername } from '../utils/botUtils.js';

const STATUS_MESSAGE_KEYS = {
  invalid_ride: 'commands.calendar.invalidRide',
  cancelled: 'commands.calendar.cancelled',
  missing_duration: 'commands.calendar.missingDuration',
  past: 'commands.calendar.past'
};

/**
 * Telegram entry points for private ride calendar exports.
 */
export class CalendarCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../services/CalendarEventService.js').CalendarEventService} calendarEventService
   */
  constructor(rideService, calendarEventService) {
    this.rideService = rideService;
    this.calendarEventService = calendarEventService;
  }

  /**
   * Send the calendar provider menu privately from an announcement callback.
   * @param {import('grammy').Context} ctx
   */
  async handleMenuCallback(ctx) {
    const loaded = await this.loadExport(ctx, ctx.match?.[1]);
    if (!loaded.exportData) {
      await this.answerExportError(ctx, loaded.errorKey);
      return;
    }

    try {
      await ctx.api.sendMessage(
        ctx.from.id,
        ctx.t('commands.calendar.menuPrompt', { title: loaded.ride.title }),
        { reply_markup: this.buildMenu(ctx, loaded.ride.id, loaded.exportData) }
      );
    } catch (error) {
      if (error?.error_code !== 403) throw error;

      const botUsername = await getBotUsername(ctx);
      await ctx.answerCallbackQuery({
        text: ctx.t('commands.calendar.openPrivateChat'),
        url: `https://t.me/${botUsername}?start=calendar_${loaded.ride.id}`
      });
      return;
    }

    await ctx.answerCallbackQuery(ctx.t('commands.calendar.sentPrivately'));
  }

  /**
   * Send the generated iCalendar document to the requesting user.
   * @param {import('grammy').Context} ctx
   */
  async handleIcsCallback(ctx) {
    const loaded = await this.loadExport(ctx, ctx.match?.[1]);
    if (!loaded.exportData) {
      await this.answerExportError(ctx, loaded.errorKey);
      return;
    }

    const inputFile = new InputFile(
      Buffer.from(loaded.exportData.ics, 'utf8'),
      loaded.exportData.filename
    );
    await ctx.api.sendDocument(ctx.from.id, inputFile, {
      caption: ctx.t('commands.calendar.fileCaption', { title: loaded.ride.title })
    });
    await ctx.answerCallbackQuery(ctx.t('commands.calendar.fileSent'));
  }

  /**
   * Close a calendar menu created in the user's private chat.
   * @param {import('grammy').Context} ctx
   */
  async handleCloseCallback(ctx) {
    if (ctx.chat?.type !== 'private') {
      await ctx.answerCallbackQuery({
        text: ctx.t('commands.calendar.privateOnly'),
        show_alert: true
      });
      return;
    }

    await ctx.deleteMessage();
    await ctx.answerCallbackQuery();
  }

  /**
   * Handle a private `/start calendar_<rideId>` payload.
   * @param {import('grammy').Context} ctx
   * @param {string} payload
   * @returns {Promise<boolean>} Whether this handler recognized the payload.
   */
  async handleStartPayload(ctx, payload) {
    const match = String(payload || '').match(/^calendar_(\w+)$/);
    if (!match) return false;

    const loaded = await this.loadExport(ctx, match[1]);
    if (!loaded.exportData) {
      await ctx.reply(ctx.t(loaded.errorKey));
      return true;
    }

    await ctx.reply(
      ctx.t('commands.calendar.menuPrompt', { title: loaded.ride.title }),
      { reply_markup: this.buildMenu(ctx, loaded.ride.id, loaded.exportData) }
    );
    return true;
  }

  /**
   * Load the current ride and construct its export.
   * @param {import('grammy').Context} ctx
   * @param {string} rideId
   * @returns {Promise<{ride?: Object, exportData?: Object, errorKey?: string}>}
   */
  async loadExport(ctx, rideId) {
    if (!/^\w+$/.test(rideId || '')) {
      return { errorKey: 'commands.calendar.invalidRide' };
    }

    const ride = await this.rideService.getRide(rideId);
    if (!ride) {
      return { errorKey: 'commands.calendar.rideNotFound' };
    }

    const exportData = this.calendarEventService.createExport(ride, { language: ctx.lang });
    if (exportData.status !== 'ok') {
      return {
        ride,
        errorKey: STATUS_MESSAGE_KEYS[exportData.status] || 'commands.calendar.invalidRide'
      };
    }

    return { ride, exportData };
  }

  /**
   * Build the private provider menu.
   * @param {import('grammy').Context} ctx
   * @param {string} rideId
   * @param {Object} exportData
   * @returns {InlineKeyboard}
   */
  buildMenu(ctx, rideId, exportData) {
    return new InlineKeyboard()
      .url(ctx.t('buttons.googleCalendar'), exportData.googleUrl)
      .url(ctx.t('buttons.outlookCalendar'), exportData.outlookUrl)
      .text(ctx.t('buttons.downloadIcs'), `calendar:ics:${rideId}`)
      .row()
      .text(ctx.t('buttons.close'), 'calendar:close');
  }

  /**
   * Display an export validation error only to the requesting user.
   * @param {import('grammy').Context} ctx
   * @param {string} errorKey
   */
  async answerExportError(ctx, errorKey) {
    await ctx.answerCallbackQuery({
      text: ctx.t(errorKey),
      show_alert: true
    });
  }
}
