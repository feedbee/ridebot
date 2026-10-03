import { InlineKeyboard } from 'grammy';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { escapeHtml } from '../utils/html-escape.js';
import { SettingsService } from '../services/SettingsService.js';

export const BOOLEAN_SETTING_CONTROLS = Object.freeze([
  { name: 'notifyParticipation', callbackKey: 'np', enableKey: 'commands.settings.enableNotifyOnParticipationChange', disableKey: 'commands.settings.disableNotifyOnParticipationChange' },
  { name: 'allowReposts', callbackKey: 'repost', enableKey: 'commands.settings.enableReposts', disableKey: 'commands.settings.disableReposts' },
  { name: 'requireParticipationApproval', callbackKey: 'approval', enableKey: 'commands.settings.enableParticipationApproval', disableKey: 'commands.settings.disableParticipationApproval' }
]);

/** Render settings without owning mutation policy or input sessions. */
export class SettingsPresenter extends BaseCommandHandler {
  /** @param {Object} handler - Settings command dependencies. */
  constructor(handler) {
    super(handler.rideService, handler.messageFormatter, handler.rideMessagesService);
    this.settingsService = handler.settingsService;
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
      this.buildSettingsTable(this.buildRideSettingRows(ctx, defaults)),
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
    return this.buildBooleanSettingsKeyboard(ctx, defaults, 'user', null)
      .text(
        this.translate(ctx, 'commands.settings.changeParticipantLimit'),
        'settings:user:participant-limit'
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
      this.buildSettingsTable(this.buildRideSettingRows(ctx, settings)),
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
    return this.buildBooleanSettingsKeyboard(ctx, settings, 'ride', rideId)
      .text(
        this.translate(ctx, 'commands.settings.changeParticipantLimit'),
        `settings:ride:participant-limit:${rideId}`
      )
      .row()
      .text(
        this.translate(ctx, 'buttons.close'),
        'settings:close'
      );
  }

  /** Build the setting rows shared by user defaults and ride settings.
   * @param {import('grammy').Context} ctx
   * @param {Object} settings
   * @returns {Array<Object>}
   */
  buildRideSettingRows(ctx, settings) {
    return [
      ...BOOLEAN_SETTING_CONTROLS.map(({ name }) =>
        this.buildBooleanSettingRow(ctx, `commands.settings.${name}Label`, settings[name])),
      this.buildParticipantLimitSettingRow(ctx, settings.participantLimit)
    ];
  }

  /** Build unchanged toggle rows for either settings scope.
   * @param {import('grammy').Context} ctx
   * @param {Object} settings
   * @param {'user'|'ride'} scope
   * @param {string|null} rideId
   * @returns {InlineKeyboard}
   */
  buildBooleanSettingsKeyboard(ctx, settings, scope, rideId) {
    const keyboard = new InlineKeyboard();
    for (const control of BOOLEAN_SETTING_CONTROLS) {
      const suffix = rideId ? `:${rideId}` : '';
      keyboard.text(this.getSettingToggleLabel(ctx, settings[control.name], control),
        `settings:${scope}:bool:${control.callbackKey}:${settings[control.name] ? 'off' : 'on'}${suffix}`).row();
    }
    return keyboard;
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
   * Build a participant-limit row for a settings table.
   * @param {import('grammy').Context} ctx
   * @param {number|undefined} participantLimit
   * @returns {{label: string, value: string}}
   */
  buildParticipantLimitSettingRow(ctx, participantLimit) {
    return {
      label: this.translate(ctx, 'commands.settings.participantLimitLabel'),
      value: participantLimit > 0
        ? participantLimit.toString()
        : this.translate(ctx, 'commands.settings.participantLimitUnlimited')
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
  }}
