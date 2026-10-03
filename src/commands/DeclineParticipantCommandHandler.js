import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { isRideArchived, RIDE_ARCHIVE_AFTER_HOURS } from '../services/ride-lifecycle.js';
import { escapeHtml } from '../utils/html-escape.js';

// Keep the profile/decline rows manageable on mobile screens.
const PARTICIPANTS_PER_PAGE = 20;

/** Creator-only participant selection and decline command. */
export class DeclineParticipantCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/RideParticipationService.js').RideParticipationService} participationService
   */
  constructor(rideService, messageFormatter, rideMessagesService, participationService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.participationService = participationService;
    /** @type {Map<string, Promise<Object>>} */
    this.rideRefreshes = new Map();
  }

  /** Open the selection menu using the standard ride-ID/reply parser.
   * @param {import('grammy').Context} ctx
   */
  async handle(ctx) {
    try {
      const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.common.onlyCreatorAction');
      if (error) return this.replyWithCodeExamples(ctx, error);
      const unavailable = this.unavailableMessage(ctx, ride);
      if (unavailable) return ctx.reply(unavailable);
      if (!this.participants(ride).length) return ctx.reply(this.translate(ctx, 'commands.declineParticipant.empty'));
      const page = this.buildPage(ctx, ride, 0);
      await ctx.reply(page.text, page.options);
    } catch (error) {
      console.error('Error opening participant decline menu:', error);
      await ctx.reply(this.translate(ctx, 'errors.generic'));
    }
  }

  /** Validate and dispatch selection, page and close callbacks.
   * @param {import('grammy').Context} ctx
   */
  async handleCallback(ctx) {
    const [, action, rideId, value, pageIndex = '0'] = ctx.match;
    const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.common.onlyCreatorAction', 'callback', 2);
    if (error) return ctx.answerCallbackQuery(error);
    if (action === 'close' || action === 'cancel') {
      await this.removeMessage(ctx);
      return ctx.answerCallbackQuery();
    }
    const unavailable = this.unavailableMessage(ctx, ride);
    if (unavailable) return ctx.answerCallbackQuery(unavailable);
    if (action === 'page') {
      const refreshed = await this.refreshRide(ctx, rideId, Number(value));
      return ctx.answerCallbackQuery(refreshed.menuUpdated ? undefined : this.translate(ctx, 'errors.generic'));
    }
    const result = await this.participationService.declineParticipant({
      rideId, participantUserId: Number(value), actorUserId: ctx.from.id, api: ctx.api
    });
    if (result.status !== 'changed') {
      if (result.status === 'stale') {
        await this.refreshRide(ctx, rideId, Number(pageIndex));
      }
      const keys = {
        forbidden: 'commands.common.onlyCreatorAction',
        ride_not_found: 'commands.participation.rideNotFound',
        ride_archived: 'commands.participation.rideArchived',
        ride_cancelled: 'commands.participation.rideCancelled',
        stale: 'commands.declineParticipant.stale'
      };
      return ctx.answerCallbackQuery(this.translate(ctx, keys[result.status] || 'errors.generic', { hours: RIDE_ARCHIVE_AFTER_HOURS }));
    }
    const updated = await this.refreshRide(ctx, rideId, Number(pageIndex), true);
    let feedbackKey = updated.success
      ? 'commands.declineParticipant.success'
      : 'commands.declineParticipant.updatedButMessageFailed';
    if (!updated.menuUpdated) feedbackKey = 'commands.declineParticipant.updatedButMenuFailed';
    await ctx.answerCallbackQuery(this.translate(ctx, feedbackKey));
  }

  /** Serialize presentation updates and read a fresh snapshot inside the queue.
   * Participant side effects can finish out of order for different users.
   * @param {import('grammy').Context} ctx
   * @param {string} rideId
   * @param {number} pageIndex
   * @param {boolean} [updateAnnouncements=false]
   * @returns {Promise<{success: boolean, menuUpdated: boolean}>}
   */
  async refreshRide(ctx, rideId, pageIndex, updateAnnouncements = false) {
    const previous = this.rideRefreshes.get(rideId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      const currentRide = await this.rideService.getRide(rideId);
      if (!currentRide) return { success: false, menuUpdated: false };
      const updated = updateAnnouncements
        ? await this.updateRideMessage(currentRide, ctx)
        : { success: true };
      const menuRide = updateAnnouncements ? await this.rideService.getRide(rideId) : currentRide;
      const menuUpdated = menuRide ? await this.refreshPage(ctx, menuRide, pageIndex) : false;
      return { success: updated.success, menuUpdated };
    });
    this.rideRefreshes.set(rideId, pending);
    try {
      return await pending;
    } catch (error) {
      console.error('Error refreshing ride after participant decline:', error);
      return { success: false, menuUpdated: false };
    } finally {
      if (this.rideRefreshes.get(rideId) === pending) this.rideRefreshes.delete(rideId);
    }
  }

  /** Refresh the same selection message, preserving the page when possible.
   * @param {import('grammy').Context} ctx
   * @param {Object} ride
   * @param {number} pageIndex
   * @returns {Promise<boolean>} - Whether the current buttons were rendered
   */
  async refreshPage(ctx, ride, pageIndex) {
    const page = this.buildPage(ctx, ride, pageIndex);
    try {
      await ctx.editMessageText(page.text, page.options);
      return true;
    } catch (error) {
      if (error.description?.includes('message is not modified')) return true;
      console.error('Error refreshing participant decline menu:', error);
      return false;
    }
  }

  /** List selectable participants in the announcement category order.
   * @param {Object} ride
   * @returns {Array<Object>}
   */
  participants(ride) {
    return ['joined', 'thinking'].flatMap(state =>
      (ride.participation?.[state] || []).map(participant => ({ ...participant, participationState: state })));
  }

  /** Return feedback for a closed ride.
   * @param {import('grammy').Context} ctx
   * @param {Object} ride
   * @returns {string|null}
   */
  unavailableMessage(ctx, ride) {
    if (isRideArchived(ride)) return this.translate(ctx, 'commands.participation.rideArchived', { hours: RIDE_ARCHIVE_AFTER_HOURS });
    return ride.cancelled ? this.translate(ctx, 'commands.participation.rideCancelled') : null;
  }

  /** Render one page as a compact heading and profile/decline button rows.
   * @param {import('grammy').Context} ctx
   * @param {Object} ride
   * @param {number} requestedPage - Zero-based page index
   * @returns {{text: string, options: Object}}
   */
  buildPage(ctx, ride, requestedPage) {
    const participants = this.participants(ride);
    const pageCount = Math.max(1, Math.ceil(participants.length / PARTICIPANTS_PER_PAGE));
    const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
    const keyboard = new InlineKeyboard();
    for (const participant of participants.slice(page * PARTICIPANTS_PER_PAGE, (page + 1) * PARTICIPANTS_PER_PAGE)) {
      const pendingIcon = ride.settings?.requireParticipationApproval ? '📝' : '🤔';
      const statusIcon = participant.participationState === 'joined' ? '🚴' : pendingIcon;
      keyboard.url(`${statusIcon} ${this.messageFormatter.formatParticipantName(participant)}`, `tg://user?id=${participant.userId}`)
        .text(this.translate(ctx, 'commands.declineParticipant.decline'), `decline:user:${ride.id}:${participant.userId}:${page}`).row();
    }
    if (pageCount > 1) {
      if (page > 0) keyboard.text('←', `decline:page:${ride.id}:${page - 1}`);
      keyboard.text(`${page + 1} / ${pageCount}`, `decline:page:${ride.id}:${page}`);
      if (page < pageCount - 1) keyboard.text('→', `decline:page:${ride.id}:${page + 1}`);
      keyboard.row();
    }
    keyboard.text(this.translate(ctx, 'buttons.close'), `decline:close:${ride.id}`);
    const text = this.translate(ctx, 'commands.declineParticipant.title', { title: escapeHtml(ride.title) })
      + (participants.length ? '' : `\n\n${this.translate(ctx, 'commands.declineParticipant.empty')}`);
    return { text, options: { parse_mode: 'HTML', reply_markup: keyboard } };
  }

  /** Best-effort cleanup; deactivate a menu if Telegram refuses deletion.
   * @param {import('grammy').Context} ctx
   */
  async removeMessage(ctx) {
    try {
      const message = ctx.callbackQuery.message;
      await ctx.api.deleteMessage(message.chat.id, message.message_id);
    } catch (error) {
      console.error('Error deleting participant decline message:', error);
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      } catch (markupError) {
        console.error('Error clearing participant decline buttons:', markupError);
      }
    }
  }
}
