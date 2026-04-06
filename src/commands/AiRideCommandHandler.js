import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { normalizeCategory } from '../utils/category-utils.js';
import { parseSpeedInput } from '../utils/speed-utils.js';
import { parseDuration } from '../utils/duration-parser.js';

const MAX_DIALOG_MESSAGES = 10;

/**
 * Handler for the /airide command.
 * Enters an iterative dialog mode: each user message refines the ride,
 * a single preview message is kept alive (edited in-place) with Confirm/Cancel
 * buttons. Up to 10 messages are allowed; on Confirm/Cancel all bot dialog
 * messages are deleted (same as the wizard).
 */
export class AiRideCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/AiRideService.js').AiRideService} aiRideService
   */
  constructor(rideService, messageFormatter, rideMessagesService, aiRideService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.aiRideService = aiRideService;
    /** @type {Map<string, Object>} keyed by `${userId}:${chatId}` */
    this.states = new Map();
  }

  /**
   * Entry point for the /airide command.
   * @param {import('grammy').Context} ctx
   */
  async handle(ctx) {
    const rawText = ctx.message.text.replace(/^\/airide\s*/i, '').trim();
    const stateKey = this._stateKey(ctx.from.id, ctx.chat.id);

    if (this.states.has(stateKey)) {
      await ctx.reply(this.translate(ctx, 'commands.airide.sessionAlreadyActive'));
      return;
    }

    const { mode, rideId, freeText } = this._parseCommandInput(rawText);

    let ride = null;
    if (mode === 'update') {
      ride = await this.rideService.getRide(rideId);
      if (!ride) {
        await ctx.reply(this.translate(ctx, 'commands.common.rideNotFoundById', { id: rideId }));
        return;
      }
      if (!this.isRideCreator(ride, ctx.from.id)) {
        await ctx.reply(this.translate(ctx, 'commands.update.onlyCreator'));
        return;
      }
    }

    this.states.set(stateKey, {
      mode,
      rideId,
      ride,
      userMessages: [],
      messageCount: 0,
      lastParams: null,
      previewMessageId: null,
      botMessageIds: []
    });

    if (freeText) {
      await this._processMessage(ctx, stateKey, freeText);
    } else {
      const promptKey = mode === 'update'
        ? 'commands.airide.dialogUpdatePrompt'
        : 'commands.airide.dialogPrompt';
      const msg = await ctx.reply(this.translate(ctx, promptKey));
      const state = this.states.get(stateKey);
      if (state) state.botMessageIds.push(msg.message_id);
    }
  }

  /**
   * Handles each user message in the dialog.
   * @param {import('grammy').Context} ctx
   */
  async handleTextInput(ctx) {
    if (ctx.message?.text?.startsWith('/')) return;

    const stateKey = this._stateKey(ctx.from.id, ctx.chat.id);
    const state = this.states.get(stateKey);
    if (!state) return;

    if (state.messageCount >= MAX_DIALOG_MESSAGES) return;

    await this._processMessage(ctx, stateKey, ctx.message.text);
  }

  /**
   * Handles confirm/cancel callback queries.
   * Callback data format: `airide:(confirm|cancel):<userId>:<chatId>`
   * @param {import('grammy').Context} ctx
   */
  async handleCallback(ctx) {
    const action = ctx.match[1];
    const stateKey = ctx.match[2];
    const state = this.states.get(stateKey);

    if (!state) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.airide.sessionExpired'));
      return;
    }

    if (action === 'cancel') {
      this.states.delete(stateKey);
      await this._cleanupDialog(ctx, state);
      await ctx.answerCallbackQuery();
      await ctx.reply(this.translate(ctx, 'commands.airide.cancelled'));
      return;
    }

    if (action === 'confirm') {
      // Validate required fields before saving
      const params = state.lastParams ?? {};
      const existingRide = state.ride;
      const hasTitle = params.title || existingRide?.title;
      const hasWhen = params.when || existingRide?.date;

      if (!hasTitle || !hasWhen) {
        const missing = [
          !hasTitle ? (ctx.lang === 'ru' ? 'название' : 'title') : null,
          !hasWhen  ? (ctx.lang === 'ru' ? 'дата'    : 'date')  : null
        ].filter(Boolean).join(', ');
        await ctx.answerCallbackQuery(
          this.translate(ctx, 'commands.airide.missingFieldsError', { fields: missing })
        );
        return;
      }

      await this._executeRideOperation(ctx, stateKey, state);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  _stateKey(userId, chatId) {
    return `${userId}:${chatId}`;
  }

  /**
   * Detect update mode when text starts with optional `#rideId`.
   * `/airide`          → create, no freeText
   * `/airide <text>`   → create, freeText = text
   * `/airide #id`      → update, no freeText
   * `/airide #id text` → update, freeText = text
   */
  _parseCommandInput(text) {
    if (!text) return { mode: 'create', rideId: null, freeText: null };

    const match = text.match(/^#([a-zA-Z0-9]+)(?:\s+([\s\S]+))?$/);
    if (match) {
      return { mode: 'update', rideId: match[1], freeText: match[2]?.trim() || null };
    }
    return { mode: 'create', rideId: null, freeText: text };
  }

  /**
   * Process a single dialog message: call AI, update preview.
   */
  async _processMessage(ctx, stateKey, text) {
    const state = this.states.get(stateKey);
    if (!state) return;

    state.userMessages.push(text);
    state.messageCount++;

    const { params, error } = await this.aiRideService.parseRideText('', {
      dialogMessages: state.userMessages
    });

    if (error) {
      this.states.delete(stateKey);
      await ctx.reply(this.translate(ctx, 'commands.airide.parseError'));
      return;
    }

    state.lastParams = params;

    const previewObj = this._buildPreviewObject(params, state);
    const previewText = this.messageFormatter.formatRidePreview(previewObj, ctx.lang);
    const atLimit = state.messageCount >= MAX_DIALOG_MESSAGES;
    const fullText = atLimit
      ? `${previewText}\n\n${this.translate(ctx, 'commands.airide.dialogLimitReached')}`
      : previewText;

    const keyboard = new InlineKeyboard()
      .text(this.translate(ctx, 'buttons.cancel'),             `airide:cancel:${stateKey}`)
      .text(this.translate(ctx, 'commands.airide.confirmButton'), `airide:confirm:${stateKey}`);

    await this._updateOrSendPreview(ctx, state, fullText, keyboard);
  }

  /**
   * Edit the existing preview in-place, or send a new one if not yet created.
   * Mirrors the pattern used by RideWizard.updatePreviewMessage().
   */
  async _updateOrSendPreview(ctx, state, text, keyboard) {
    const opts = { parse_mode: 'HTML', reply_markup: keyboard };

    if (!state.previewMessageId) {
      const msg = await ctx.reply(text, opts);
      state.previewMessageId = msg.message_id;
      state.botMessageIds.push(msg.message_id);
      return;
    }

    try {
      await ctx.api.editMessageText(ctx.chat.id, state.previewMessageId, text, opts);
    } catch (err) {
      if (err.description?.includes('message is not modified') ||
          err.message?.includes('message is not modified')) {
        return;
      }
      // On any other edit error, re-send and update the tracked ID
      const msg = await ctx.reply(text, opts);
      // Replace old ID with new one in botMessageIds
      const idx = state.botMessageIds.indexOf(state.previewMessageId);
      if (idx !== -1) state.botMessageIds[idx] = msg.message_id;
      state.previewMessageId = msg.message_id;
    }
  }

  /**
   * Delete all bot messages in the dialog (in reverse order).
   */
  async _cleanupDialog(ctx, state) {
    for (const msgId of [...state.botMessageIds].reverse()) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, msgId);
      } catch { /* ignore individual failures */ }
    }
  }

  /**
   * Build a ride-like preview object from raw AI params for formatRidePreview().
   * In update mode, existing ride fields are used as fallback so the preview
   * reflects the full final state (existing + changes).
   * @param {Object} params - AI-extracted params
   * @param {Object|null} state - handler state (used to access existing ride in update mode)
   */
  _buildPreviewObject(params, state = null) {
    const existingRide = state?.mode === 'update' ? state.ride : null;

    const preview = {
      title:        params.title     || existingRide?.title       || null,
      date:         null,
      category:     null,
      organizer:    params.organizer || existingRide?.organizer   || null,
      meetingPoint: params.meet      || existingRide?.meetingPoint || null,
      routeLink:    params.route     || existingRide?.routeLink   || null,
      distance:     params.dist      ? parseFloat(params.dist)
                                     : (existingRide?.distance   ?? null),
      duration:     null, // parsed below
      speedMin:     null,
      speedMax:     null,
      additionalInfo: null
    };

    // date: AI param takes priority, else fall back to existing ride date
    if (params.when) {
      try {
        const result = parseDateTimeInput(params.when);
        preview.date = result?.date ?? null;
      } catch { /* show no date if parsing fails */ }
    } else if (existingRide?.date) {
      preview.date = existingRide.date;
    }

    // duration: parse string into minutes (same as FieldProcessor does on save)
    if (params.duration) {
      const durationResult = parseDuration(params.duration);
      preview.duration = durationResult.duration ?? null;
    } else if (existingRide?.duration != null) {
      preview.duration = existingRide.duration; // already in minutes
    }

    // category: AI param takes priority, else fall back to existing
    const categoryStr = params.category || existingRide?.category || null;
    if (categoryStr) {
      preview.category = normalizeCategory(categoryStr);
    }

    // speed: parse into speedMin/speedMax (same as FieldProcessor does on save)
    const speedStr = params.speed ?? null;
    if (speedStr) {
      const speedResult = parseSpeedInput(speedStr);
      if (speedResult) {
        preview.speedMin = speedResult.speedMin ?? null;
        preview.speedMax = speedResult.speedMax ?? null;
      }
    } else if (existingRide) {
      preview.speedMin = existingRide.speedMin ?? null;
      preview.speedMax = existingRide.speedMax ?? null;
    }

    // additionalInfo: only free-form notes
    if (params.info) {
      preview.additionalInfo = params.info;
    }

    return preview;
  }

  async _executeRideOperation(ctx, stateKey, state) {
    const options = { language: ctx.lang };
    let result;

    if (state.mode === 'create') {
      result = await this.rideService.createRideFromParams(
        state.lastParams,
        ctx.chat.id,
        ctx.from,
        options
      );
    } else {
      result = await this.rideService.updateRideFromParams(
        state.rideId,
        state.lastParams,
        ctx.from.id,
        options
      );
    }

    this.states.delete(stateKey);
    await this._cleanupDialog(ctx, state);

    if (result.error) {
      await ctx.answerCallbackQuery();
      await ctx.reply(result.error);
      return;
    }

    await ctx.answerCallbackQuery();

    if (state.mode === 'create') {
      await this.rideMessagesService.createRideMessage(result.ride, ctx);
    } else {
      const updateResult = await this.updateRideMessage(result.ride, ctx);
      if (updateResult.success) {
        const msg = this.formatUpdateResultMessage(
          ctx,
          updateResult,
          this.translate(ctx, 'commands.common.actions.updated')
        );
        await ctx.reply(msg);
      } else {
        await ctx.reply(this.translate(ctx, 'commands.update.messageUpdateError'));
      }
    }
  }
}
