import { InlineKeyboard } from 'grammy';
import { randomBytes } from 'node:crypto';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { UserProfile } from '../models/UserProfile.js';
import { parseParticipantLimit } from '../utils/participant-limit.js';

/** Own the scoped numeric-input session and its Telegram interaction. */
export class ParticipantLimitInputHandler extends BaseCommandHandler {
  /** @param {Object} settingsHandler - Settings presentation and service dependencies. */
  constructor(settingsHandler) {
    super(settingsHandler.rideService, settingsHandler.messageFormatter, settingsHandler.rideMessagesService);
    this.settingsHandler = settingsHandler;
    this.settingsService = settingsHandler.settingsService;
    /** @type {Map<number, Object>} */
    this.pendingParticipantLimitInputs = new Map();
  }

  /**
   * Prompt for a new user-default participant limit.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleUserParticipantLimitCallback(ctx) {
    const inputScope = this.getParticipantLimitInputScope(ctx);
    const pending = {
      scope: 'user',
      inputId: randomBytes(8).toString('hex'),
      messageIds: new Set(),
      ...inputScope
    };
    this.pendingParticipantLimitInputs.set(ctx.from.id, pending);
    await ctx.answerCallbackQuery();
    await this.replyWithParticipantLimitPrompt(ctx, pending);
  }

  /**
   * Prompt for a new participant limit on one ride.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleRideParticipantLimitCallback(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.common.onlyCreatorAction',
      'callback'
    );
    if (error) {
      await ctx.answerCallbackQuery(error);
      return;
    }

    const inputScope = this.getParticipantLimitInputScope(ctx);
    const pending = {
      scope: 'ride',
      inputId: randomBytes(8).toString('hex'),
      messageIds: new Set(),
      ...inputScope,
      rideId: ride.id
    };
    this.pendingParticipantLimitInputs.set(ctx.from.id, pending);
    await ctx.answerCallbackQuery();
    await this.replyWithParticipantLimitPrompt(ctx, pending);
  }

  /**
   * Cancel the current participant-limit input flow.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleParticipantLimitCancel(ctx) {
    const pending = this.pendingParticipantLimitInputs.get(ctx.from.id);
    if (
      !pending
      || pending.inputId !== ctx.match?.[1]
      || !this.isParticipantLimitInputScope(pending, ctx)
    ) {
      await ctx.answerCallbackQuery();
      return;
    }

    this.trackParticipantLimitMessage(pending, ctx.callbackQuery?.message);
    this.cancelPendingParticipantLimitInput(ctx);
    await ctx.answerCallbackQuery(
      this.translate(ctx, 'commands.settings.participantLimitCancelled')
    );
    await this.cleanupParticipantLimitMessages(ctx, pending);
  }

  /**
   * Consume text while a participant-limit input flow is active.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<boolean>} Whether the message belonged to this flow.
   */
  async handleTextInput(ctx) {
    const pending = this.pendingParticipantLimitInputs.get(ctx.from.id);
    if (!pending || !this.isParticipantLimitInputScope(pending, ctx)) return false;

    this.trackParticipantLimitMessage(pending, ctx.message);
    const participantLimit = parseParticipantLimit(ctx.message?.text);
    if (participantLimit === null) {
      const errorMessage = await ctx.reply(
        this.translate(ctx, 'params.validation.participantLimitInvalid'),
        { reply_markup: this.buildParticipantLimitCancelKeyboard(ctx, pending.inputId) }
      );
      this.trackParticipantLimitMessage(pending, errorMessage);
      return true;
    }

    if (pending.scope === 'user') {
      const updatedUser = await this.settingsService.updateUserRideDefaults(
        UserProfile.fromTelegramUser(ctx.from),
        { participantLimit }
      );
      this.pendingParticipantLimitInputs.delete(ctx.from.id);
      await this.settingsHandler.showUserSettings(ctx, 'reply', {
        rideDefaults: updatedUser.settings.rideDefaults
      });
      return true;
    }

    const ride = await this.rideService.getRide(pending.rideId);
    if (!ride) {
      this.pendingParticipantLimitInputs.delete(ctx.from.id);
      await ctx.reply(this.translate(ctx, 'commands.common.rideNotFoundById', {
        id: pending.rideId
      }));
      return true;
    }
    if (!this.isRideCreator(ride, ctx.from.id)) {
      this.pendingParticipantLimitInputs.delete(ctx.from.id);
      await ctx.reply(this.translate(ctx, 'commands.common.onlyCreatorAction'));
      return true;
    }

    const updatedRide = await this.rideService.updateRide(
      ride.id,
      { settings: { participantLimit } },
      ctx.from.id
    );
    this.pendingParticipantLimitInputs.delete(ctx.from.id);
    const updateResult = await this.updateRideMessage(updatedRide, ctx);
    await this.settingsHandler.showRideSettings(ctx, 'reply', updatedRide);
    if (!updateResult.success) {
      await ctx.reply(this.translate(ctx, 'commands.settings.rideUpdatedMessageFailed'));
    }
    return true;
  }

  /**
   * Stop waiting for participant-limit text when another flow starts.
   * @param {import('grammy').Context} ctx
   */
  cancelPendingParticipantLimitInput(ctx) {
    this.pendingParticipantLimitInputs.delete(ctx.from.id);
  }

  /**
   * Identify the Telegram conversation where numeric input is expected.
   * @param {import('grammy').Context} ctx
   * @returns {{chatId: number|string, messageThreadId: number|null}}
   */
  getParticipantLimitInputScope(ctx) {
    return {
      chatId: ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id,
      messageThreadId: ctx.message?.message_thread_id
        ?? ctx.callbackQuery?.message?.message_thread_id
        ?? null
    };
  }

  /**
   * @param {{chatId: number|string, messageThreadId: number|null}} pending
   * @param {import('grammy').Context} ctx
   * @returns {boolean}
   */
  isParticipantLimitInputScope(pending, ctx) {
    const current = this.getParticipantLimitInputScope(ctx);
    return pending.chatId === current.chatId
      && pending.messageThreadId === current.messageThreadId;
  }

  /**
   * Send the localized numeric-input prompt.
   * @param {import('grammy').Context} ctx
   * @param {Object} pending
   * @returns {Promise<void>}
   */
  async replyWithParticipantLimitPrompt(ctx, pending) {
    const message = await ctx.reply(
      this.translate(ctx, 'commands.settings.participantLimitPrompt'),
      { reply_markup: this.buildParticipantLimitCancelKeyboard(ctx, pending.inputId) }
    );
    this.trackParticipantLimitMessage(pending, message);
  }

  /**
   * Track only messages belonging to this numeric-input session.
   * @param {Object} pending
   * @param {Object|undefined} message
   * @returns {void}
   */
  trackParticipantLimitMessage(pending, message) {
    if (Number.isInteger(message?.message_id)) pending.messageIds.add(message.message_id);
  }

  /**
   * Delete the cancelled conversation, tolerating individual Telegram failures.
   * @param {import('grammy').Context} ctx
   * @param {Object} pending
   * @returns {Promise<void>}
   */
  async cleanupParticipantLimitMessages(ctx, pending) {
    for (const messageId of [...pending.messageIds].reverse()) {
      try {
        await ctx.api.deleteMessage(pending.chatId, messageId);
      } catch { /* Best effort, like wizard dialog cleanup. */ }
    }
  }

  /**
   * Build the cancel keyboard shared by prompts and validation errors.
   * @param {import('grammy').Context} ctx
   * @param {string} inputId
   * @returns {InlineKeyboard}
   */
  buildParticipantLimitCancelKeyboard(ctx, inputId) {
    return new InlineKeyboard().text(
      this.translate(ctx, 'commands.settings.participantLimitCancel'),
      `settings:participant-limit:cancel:${inputId}`
    );
  }

}
