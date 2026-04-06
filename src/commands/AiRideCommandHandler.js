import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { normalizeCategory } from '../utils/category-utils.js';
import { parseSpeedInput } from '../utils/speed-utils.js';
import { parseDuration } from '../utils/duration-parser.js';

const MAX_RETRIES = 2;

/**
 * Handler for the /airide command.
 * Creates or updates a ride from a free-form natural language description
 * using Claude AI to extract structured fields.
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

    if (!rawText) {
      await ctx.reply(this.translate(ctx, 'commands.airide.usageHint'));
      return;
    }

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

    const parsingMsg = await ctx.reply(this.translate(ctx, 'commands.airide.parsing'));
    const { params, error } = await this.aiRideService.parseRideText(freeText, {
      isUpdate: mode === 'update'
    });

    try {
      await ctx.api.deleteMessage(ctx.chat.id, parsingMsg.message_id);
    } catch { /* ignore if deletion fails */ }

    if (error) {
      await ctx.reply(this.translate(ctx, 'commands.airide.parseError'));
      return;
    }

    this.states.set(stateKey, {
      mode,
      rideId,
      ride,
      originalText: freeText,
      parsedParams: params,
      step: null,
      missingField: null,
      retryCount: 0,
      confirmMessageId: null
    });

    await this._handleParsedParams(ctx, stateKey, params);
  }

  /**
   * Handles follow-up text when a session is awaiting a missing required field.
   * @param {import('grammy').Context} ctx
   */
  async handleTextInput(ctx) {
    if (ctx.message?.text?.startsWith('/')) return;

    const stateKey = this._stateKey(ctx.from.id, ctx.chat.id);
    const state = this.states.get(stateKey);

    if (!state || state.step !== 'awaiting_followup') return;

    if (state.retryCount >= MAX_RETRIES) {
      this.states.delete(stateKey);
      await ctx.reply(this.translate(ctx, 'commands.airide.tooManyRetries'));
      return;
    }

    state.retryCount++;

    const { params, error } = await this.aiRideService.parseRideText(state.originalText, {
      isUpdate: state.mode === 'update',
      originalText: state.originalText,
      followUpText: ctx.message.text
    });

    if (error) {
      this.states.delete(stateKey);
      await ctx.reply(this.translate(ctx, 'commands.airide.parseError'));
      return;
    }

    state.parsedParams = params;
    await this._handleParsedParams(ctx, stateKey, params);
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
      if (state.confirmMessageId) {
        try { await ctx.api.deleteMessage(ctx.chat.id, state.confirmMessageId); } catch { /* ignore */ }
      }
      await ctx.answerCallbackQuery();
      await ctx.reply(this.translate(ctx, 'commands.airide.cancelled'));
      return;
    }

    if (action === 'confirm') {
      await this._executeRideOperation(ctx, stateKey, state);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  _stateKey(userId, chatId) {
    return `${userId}:${chatId}`;
  }

  /**
   * Detect update mode when text starts with `#rideId`.
   * Example: `/airide #abc123 change date to Sunday`
   */
  _parseCommandInput(text) {
    const match = text.match(/^#([a-zA-Z0-9]+)\s+(.+)$/s);
    if (match) {
      return { mode: 'update', rideId: match[1], freeText: match[2].trim() };
    }
    return { mode: 'create', rideId: null, freeText: text };
  }

  /**
   * After AI parsing: check for missing required fields, ask follow-up, or show preview.
   */
  async _handleParsedParams(ctx, stateKey, params) {
    const state = this.states.get(stateKey);
    const existingRide = state.ride;
    // In update mode, a field is only "missing" if neither the AI extracted it
    // nor the existing ride already has it.
    const missingTitle = state.mode === 'create'
      ? !params.title
      : !params.title && !existingRide?.title;
    const missingWhen = state.mode === 'create'
      ? !params.when
      : !params.when && !existingRide?.date;
    const missingField = missingTitle ? 'title' : (missingWhen ? 'when' : null);

    if (missingField) {
      state.step = 'awaiting_followup';
      state.missingField = missingField;
      await ctx.reply(this.translate(ctx, `commands.airide.missingField.${missingField}`));
      return;
    }

    state.step = 'awaiting_confirmation';
    await this._sendPreview(ctx, stateKey, params);
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

    // additionalInfo: only free-form notes, not speed (speed is now in its own fields)
    if (params.info) {
      preview.additionalInfo = params.info;
    }

    return preview;
  }

  async _sendPreview(ctx, stateKey, params) {
    const state = this.states.get(stateKey);
    const previewObj = this._buildPreviewObject(params, state);
    const previewText = this.messageFormatter.formatRidePreview(previewObj, ctx.lang);

    const keyboard = new InlineKeyboard()
      .text(
        this.translate(ctx, 'buttons.cancel'),
        `airide:cancel:${stateKey}`
      )
      .text(
        this.translate(ctx, 'commands.airide.confirmButton'),
        `airide:confirm:${stateKey}`
      );

    const confirmMsg = await ctx.reply(
      `${previewText}\n\n${this.translate(ctx, 'commands.airide.confirmPrompt')}`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );

    state.confirmMessageId = confirmMsg.message_id;
  }

  async _executeRideOperation(ctx, stateKey, state) {
    const options = { language: ctx.lang };
    let result;

    if (state.mode === 'create') {
      result = await this.rideService.createRideFromParams(
        state.parsedParams,
        ctx.chat.id,
        ctx.from,
        options
      );
    } else {
      result = await this.rideService.updateRideFromParams(
        state.rideId,
        state.parsedParams,
        ctx.from.id,
        options
      );
    }

    this.states.delete(stateKey);

    if (state.confirmMessageId) {
      try { await ctx.api.deleteMessage(ctx.chat.id, state.confirmMessageId); } catch { /* ignore */ }
    }

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
