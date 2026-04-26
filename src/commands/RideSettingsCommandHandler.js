import { BaseCommandHandler } from './BaseCommandHandler.js';
import { InlineKeyboard } from 'grammy';
import { UserProfile } from '../models/UserProfile.js';
import { escapeHtml } from '../utils/html-escape.js';
import { SettingsService } from '../services/SettingsService.js';

const BOOLEAN_SETTING_CALLBACK_KEYS = {
  np: 'notifyParticipation',
  repost: 'allowReposts'
};

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
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleUserBooleanCallback(ctx) {
    const settingName = this.getBooleanSettingName(ctx.match?.[1]);
    if (!settingName) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'errors.generic'));
      return;
    }

    const desiredValue = this.parseBooleanCallbackValue(ctx.match?.[2]);
    const currentDefaults = await this.settingsService.getUserRideDefaults(ctx.from.id);
    let defaults = currentDefaults;

    if (currentDefaults[settingName] !== desiredValue) {
      const updatedUser = await this.settingsService.updateUserRideDefaults(
        UserProfile.fromTelegramUser(ctx.from),
        {
          [settingName]: desiredValue
        }
      );
      defaults = updatedUser.settings.rideDefaults;
    }

    await this.showUserSettings(ctx, 'edit', defaults);
    await ctx.answerCallbackQuery(this.translate(ctx, 'commands.settings.updated'));
  }

  /**
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleRideBooleanCallback(ctx) {
    const settingName = this.getBooleanSettingName(ctx.match?.[1]);
    if (!settingName) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'errors.generic'));
      return;
    }

    const { ride, error } = await this.extractRideWithCreatorCheck(
      ctx,
      'commands.common.onlyCreatorAction',
      'callback',
      3
    );
    if (error) {
      await ctx.answerCallbackQuery(error);
      return;
    }

    const desiredValue = this.parseBooleanCallbackValue(ctx.match?.[2]);
    const currentSettings = SettingsService.getRideSettingsSnapshot(ride);
    let rideToRender = ride;

    if (currentSettings[settingName] !== desiredValue) {
      rideToRender = await this.rideService.updateRide(
        ride.id,
        {
          settings: {
            [settingName]: desiredValue
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
    return [
      `<b>${this.translate(ctx, 'commands.settings.userTitle')}</b>`,
      '',
      this.buildSettingLine(ctx, 'commands.settings.notifyParticipationLabel', defaults.notifyParticipation),
      this.buildSettingLine(ctx, 'commands.settings.allowRepostsLabel', defaults.allowReposts),
      this.translate(ctx, 'commands.settings.userHint')
    ].join('\n');
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} defaults
   * @returns {InlineKeyboard}
   */
  buildUserSettingsKeyboard(ctx, defaults) {
    return new InlineKeyboard()
      .text(
        this.getSettingToggleLabel(ctx, defaults.notifyParticipation, {
          enableKey: 'commands.settings.enableNotifyOnParticipationChange',
          disableKey: 'commands.settings.disableNotifyOnParticipationChange'
        }),
        `settings:user:bool:np:${defaults.notifyParticipation ? 'off' : 'on'}`
      )
      .row()
      .text(
        this.getSettingToggleLabel(ctx, defaults.allowReposts, {
          enableKey: 'commands.settings.enableReposts',
          disableKey: 'commands.settings.disableReposts'
        }),
        `settings:user:bool:repost:${defaults.allowReposts ? 'off' : 'on'}`
      );
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} ride
   * @param {Object} settings
   * @returns {string}
   */
  buildRideSettingsText(ctx, ride, settings) {
    return [
      `<b>${this.translate(ctx, 'commands.settings.rideTitle')}</b>`,
      `${escapeHtml(ride.title)} (#${ride.id})`,
      '',
      this.buildSettingLine(ctx, 'commands.settings.notifyParticipationLabel', settings.notifyParticipation),
      this.buildSettingLine(ctx, 'commands.settings.allowRepostsLabel', settings.allowReposts),
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
    return new InlineKeyboard()
      .text(
        this.getSettingToggleLabel(ctx, settings.notifyParticipation, {
          enableKey: 'commands.settings.enableNotifyOnParticipationChange',
          disableKey: 'commands.settings.disableNotifyOnParticipationChange'
        }),
        `settings:ride:bool:np:${settings.notifyParticipation ? 'off' : 'on'}:${rideId}`
      )
      .row()
      .text(
        this.getSettingToggleLabel(ctx, settings.allowReposts, {
          enableKey: 'commands.settings.enableReposts',
          disableKey: 'commands.settings.disableReposts'
        }),
        `settings:ride:bool:repost:${settings.allowReposts ? 'off' : 'on'}:${rideId}`
      );
  }

  /**
   * @param {string} value
   * @returns {boolean}
   */
  parseBooleanCallbackValue(value) {
    return value === 'on';
  }

  /**
   * @param {string} callbackKey
   * @returns {'notifyParticipation'|'allowReposts'|null}
   */
  getBooleanSettingName(callbackKey) {
    return BOOLEAN_SETTING_CALLBACK_KEYS[callbackKey] || null;
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {string} labelKey
   * @param {boolean} value
   * @returns {string}
   */
  buildSettingLine(ctx, labelKey, value) {
    const valueLabel = value
      ? this.translate(ctx, 'common.yes')
      : this.translate(ctx, 'common.no');
    return `${this.translate(ctx, labelKey)}: <b>${valueLabel}</b>`;
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {boolean} currentValue
   * @param {{enableKey: string, disableKey: string}} keys
   * @returns {string}
   */
  getSettingToggleLabel(ctx, currentValue, keys) {
    return currentValue
      ? this.translate(ctx, keys.disableKey)
      : this.translate(ctx, keys.enableKey);
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
