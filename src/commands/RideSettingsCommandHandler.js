import { BaseCommandHandler } from './BaseCommandHandler.js';
import { InlineKeyboard } from 'grammy';
import { UserProfile } from '../models/UserProfile.js';
import { escapeHtml } from '../utils/html-escape.js';
import { SettingsService } from '../services/SettingsService.js';

/**
 * Settings handler for user defaults and ride-scoped settings.
 */
export class RideSettingsCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/SettingsService.js').SettingsService} settingsService
   */
  constructor(rideService, messageFormatter, rideMessagesService, settingsService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.settingsService = settingsService;
  }

  /**
   * Handle the /settings command.
   *
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handle(ctx) {
    const commandTail = (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim();
    if (ctx.message?.reply_to_message || commandTail) {
      const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.common.onlyCreatorAction');
      if (error) {
        await ctx.reply(error);
        return;
      }

      await this.showRideSettings(ctx, 'reply', ride);
      return;
    }

    await this.showUserSettings(ctx, 'reply');
  }

  /**
   * Handle owner action callback for ride settings button.
   */
  async handleCallback(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.common.onlyCreatorAction',
      'callback'
    );
    if (error) {
      await this.replyOrAnswerCallback(ctx, 'callback', error);
      return;
    }

    await ctx.answerCallbackQuery();
    await this.showRideSettings(ctx, 'reply', ride);
  }

  /**
   * Handle user-default toggle callbacks.
   *
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleUserCallback(ctx) {
    const desiredValue = this.parseNotifyCallbackValue(ctx.match?.[1]);
    const currentDefaults = await this.settingsService.getUserRideDefaults(ctx.from.id);
    let defaults = currentDefaults;

    if (currentDefaults.notifyParticipation !== desiredValue) {
      const updatedUser = await this.settingsService.updateUserRideDefaults(
        UserProfile.fromTelegramUser(ctx.from),
        {
          notifyParticipation: desiredValue
        }
      );
      defaults = updatedUser.settings.rideDefaults;
    }

    await this.showUserSettings(ctx, 'edit', defaults);
    await ctx.answerCallbackQuery(this.translate(ctx, 'commands.settings.updated'));
  }

  /**
   * Handle ride-scoped toggle callbacks.
   *
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleRideCallback(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.common.onlyCreatorAction',
      'callback',
      2
    );
    if (error) {
      await ctx.answerCallbackQuery(error);
      return;
    }

    const desiredValue = this.parseNotifyCallbackValue(ctx.match?.[1]);
    const currentSettings = SettingsService.getRideSettingsSnapshot(ride);
    let rideToRender = ride;

    if (currentSettings.notifyParticipation !== desiredValue) {
      rideToRender = await this.rideService.updateRide(
        ride.id,
        {
          settings: {
            notifyParticipation: desiredValue
          }
        },
        ctx.from.id
      );
    }

    await this.showRideSettings(ctx, 'edit', rideToRender);
    await ctx.answerCallbackQuery(this.translate(ctx, 'commands.settings.rideUpdated'));
  }

  /**
   * Render the current user-defaults settings screen.
   *
   * @param {import('grammy').Context} ctx
   * @param {'reply'|'edit'} mode
   * @param {Object|null} defaultsOverride
   * @returns {Promise<void>}
   */
  async showUserSettings(ctx, mode, defaultsOverride = null) {
    const defaults = defaultsOverride || await this.settingsService.getUserRideDefaults(ctx.from.id);
    const text = this.buildUserSettingsText(ctx, defaults);
    const keyboard = this.buildUserSettingsKeyboard(ctx, defaults);
    const options = {
      parse_mode: 'HTML',
      reply_markup: keyboard
    };

    if (mode === 'edit') {
      await this.editMessageTextIgnoringNotModified(ctx, text, options);
      return;
    }

    await ctx.reply(text, options);
  }

  /**
   * Render the current ride settings screen.
   *
   * @param {import('grammy').Context} ctx
   * @param {'reply'|'edit'} mode
   * @param {Object} ride
   * @returns {Promise<void>}
   */
  async showRideSettings(ctx, mode, ride) {
    const settings = SettingsService.getRideSettingsSnapshot(ride);
    const text = this.buildRideSettingsText(ctx, ride, settings);
    const keyboard = this.buildRideSettingsKeyboard(ctx, ride.id, settings);
    const options = {
      parse_mode: 'HTML',
      reply_markup: keyboard
    };

    if (mode === 'edit') {
      await this.editMessageTextIgnoringNotModified(ctx, text, options);
      return;
    }

    await ctx.reply(text, options);
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} defaults
   * @returns {string}
   */
  buildUserSettingsText(ctx, defaults) {
    const enabledLabel = defaults.notifyParticipation
      ? this.translate(ctx, 'common.yes')
      : this.translate(ctx, 'common.no');

    return [
      `<b>${this.translate(ctx, 'commands.settings.userTitle')}</b>`,
      '',
      `${this.translate(ctx, 'commands.settings.notifyParticipationLabel')}: <b>${enabledLabel}</b>`,
      this.translate(ctx, 'commands.settings.userHint')
    ].join('\n');
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} defaults
   * @returns {InlineKeyboard}
   */
  buildUserSettingsKeyboard(ctx, defaults) {
    const toggleLabel = defaults.notifyParticipation
      ? this.translate(ctx, 'commands.settings.disableNotifyOnParticipationChange')
      : this.translate(ctx, 'commands.settings.enableNotifyOnParticipationChange');
    const desiredValue = defaults.notifyParticipation ? 'off' : 'on';

    return new InlineKeyboard()
      .text(toggleLabel, `settings:user:np:${desiredValue}`);
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} ride
   * @param {Object} settings
   * @returns {string}
   */
  buildRideSettingsText(ctx, ride, settings) {
    const enabledLabel = settings.notifyParticipation
      ? this.translate(ctx, 'common.yes')
      : this.translate(ctx, 'common.no');

    return [
      `<b>${this.translate(ctx, 'commands.settings.rideTitle')}</b>`,
      `${escapeHtml(ride.title)} (#${ride.id})`,
      '',
      `${this.translate(ctx, 'commands.settings.notifyParticipationLabel')}: <b>${enabledLabel}</b>`,
      this.translate(ctx, 'commands.settings.rideHint')
    ].join('\n');
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {string} rideId
   * @param {Object} settings
   * @returns {InlineKeyboard}
   */
  buildRideSettingsKeyboard(ctx, rideId, settings) {
    const toggleLabel = settings.notifyParticipation
      ? this.translate(ctx, 'commands.settings.disableNotifyOnParticipationChange')
      : this.translate(ctx, 'commands.settings.enableNotifyOnParticipationChange');
    const desiredValue = settings.notifyParticipation ? 'off' : 'on';

    return new InlineKeyboard()
      .text(toggleLabel, `settings:ride:np:${desiredValue}:${rideId}`);
  }

  /**
   * @param {string} value
   * @returns {boolean}
   */
  parseNotifyCallbackValue(value) {
    return value === 'on';
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {string} text
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async editMessageTextIgnoringNotModified(ctx, text, options) {
    try {
      await ctx.editMessageText(text, options);
    } catch (error) {
      const isNotModifiedError = error?.error_code === 400
        && (
          error?.description?.includes('message is not modified')
          || error?.message?.includes('message is not modified')
        );

      if (isNotModifiedError) {
        return;
      }
      throw error;
    }
  }
}
