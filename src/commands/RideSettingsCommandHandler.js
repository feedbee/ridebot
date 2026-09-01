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
   * Open user settings from the persistent main menu.
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleMainMenu(ctx) {
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

    await this.showUserSettings(ctx, 'edit', { rideDefaults: defaults });
    await ctx.answerCallbackQuery(this.translate(ctx, 'commands.settings.updated'));
  }

  /**
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleUserNotificationLevelCallback(ctx) {
    const requestedLevel = ctx.match?.[1];
    const resolvedLevel = SettingsService.resolveParticipationNotificationLevel(requestedLevel);
    if (requestedLevel !== resolvedLevel) {
      await ctx.answerCallbackQuery(this.translate(ctx, 'errors.generic'));
      return;
    }

    const currentLevel = await this.settingsService.getParticipationNotificationLevel(ctx.from.id);
    if (currentLevel !== requestedLevel) {
      await this.settingsService.updateParticipationNotificationLevel(
        UserProfile.fromTelegramUser(ctx.from),
        requestedLevel
      );
    }

    await this.showUserSettings(ctx, 'edit', { participationNotificationLevel: requestedLevel });
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
   * Close the current settings interface.
   *
   * @param {import('grammy').Context} ctx
   * @returns {Promise<void>}
   */
  async handleClose(ctx) {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage();
  }

  /**
   * Render the current user-defaults settings screen.
   *
   * @param {import('grammy').Context} ctx
   * @param {'reply'|'edit'} mode
   * @param {Object|null} defaultsOverride
   * @returns {Promise<void>}
   */
  async showUserSettings(ctx, mode, settingsOverride = null) {
    const [storedDefaults, storedLevel] = await Promise.all([
      this.settingsService.getUserRideDefaults(ctx.from.id),
      this.settingsService.getParticipationNotificationLevel(ctx.from.id)
    ]);
    const defaults = settingsOverride?.rideDefaults || storedDefaults;
    const level = settingsOverride?.participationNotificationLevel || storedLevel;
    const richMessage = { html: this.buildUserSettingsText(ctx, defaults, level) };
    const keyboard = this.buildUserSettingsKeyboard(ctx, defaults, level);
    const options = {
      reply_markup: keyboard
    };

    if (mode === 'edit') {
      await this.editMessageTextIgnoringNotModified(ctx, richMessage, options);
      return;
    }

    await ctx.replyWithRichMessage(richMessage, options);
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
    const richMessage = { html: this.buildRideSettingsText(ctx, ride, settings) };
    const keyboard = this.buildRideSettingsKeyboard(ctx, ride.id, settings);
    const options = {
      reply_markup: keyboard
    };

    if (mode === 'edit') {
      await this.editMessageTextIgnoringNotModified(ctx, richMessage, options);
      return;
    }

    await ctx.replyWithRichMessage(richMessage, options);
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} defaults
   * @returns {string}
   */
  buildUserSettingsText(ctx, defaults, level) {
    return [
      `<h3>${this.translate(ctx, 'commands.settings.userTitle')}</h3>`,
      this.buildSettingsTable([
        this.buildBooleanSettingRow(
          ctx,
          'commands.settings.notifyParticipationLabel',
          defaults.notifyParticipation
        ),
        this.buildBooleanSettingRow(
          ctx,
          'commands.settings.allowRepostsLabel',
          defaults.allowReposts
        )
      ]),
      `<footer>${this.translate(ctx, 'commands.settings.userHint')}</footer>`,
      '<hr/>',
      `<h4>${this.translate(ctx, 'commands.settings.notificationPreferencesTitle')}</h4>`,
      this.buildSettingsTable([{
        label: this.translate(ctx, 'commands.settings.participationNotificationLevelLabel'),
        value: this.translate(ctx, `commands.settings.notificationLevel.${level}`)
      }]),
      `<footer>${this.translate(ctx, 'commands.settings.notificationPreferencesHint')}</footer>`
    ].join('');
  }

  /**
   * @param {import('grammy').Context} ctx
   * @param {Object} defaults
   * @returns {InlineKeyboard}
   */
  buildUserSettingsKeyboard(ctx, defaults, level) {
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
      )
      .row()
      .text(
        `${level === 'all' ? '✓ ' : ''}${this.translate(ctx, 'commands.settings.notificationLevel.all')}`,
        'settings:user:notification-level:all'
      )
      .row()
      .text(
        `${level === 'membership' ? '✓ ' : ''}${this.translate(ctx, 'commands.settings.notificationLevel.membership')}`,
        'settings:user:notification-level:membership'
      )
      .row()
      .text(
        this.translate(ctx, 'buttons.close'),
        'settings:close'
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
      `<h3>${this.translate(ctx, 'commands.settings.rideTitle')}</h3>`,
      `<p>${escapeHtml(ride.title)} (#${escapeHtml(ride.id.toString())})</p>`,
      this.buildSettingsTable([
        this.buildBooleanSettingRow(
          ctx,
          'commands.settings.notifyParticipationLabel',
          settings.notifyParticipation
        ),
        this.buildBooleanSettingRow(
          ctx,
          'commands.settings.allowRepostsLabel',
          settings.allowReposts
        )
      ]),
      `<footer>${this.translate(ctx, 'commands.settings.rideHint')}</footer>`
    ].join('');
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
      )
      .row()
      .text(
        this.translate(ctx, 'buttons.close'),
        'settings:close'
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
   * @returns {{label: string, value: string}}
   */
  buildBooleanSettingRow(ctx, labelKey, value) {
    const valueLabel = value
      ? this.translate(ctx, 'common.yes')
      : this.translate(ctx, 'common.no');
    return {
      label: this.translate(ctx, labelKey),
      value: valueLabel
    };
  }

  /**
   * Build a compact two-column key-value table for Telegram Rich HTML.
   *
   * @param {Array<{label: string, value: string}>} rows
   * @returns {string}
   */
  buildSettingsTable(rows) {
    const body = rows
      .map(({ label, value }) => `<tr><td>${label}</td><td><b>${value}</b></td></tr>`)
      .join('');
    return `<table bordered striped compact>${body}</table>`;
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
   * @param {Object} richMessage
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async editMessageTextIgnoringNotModified(ctx, richMessage, options) {
    try {
      await ctx.editMessageText(richMessage, options);
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
