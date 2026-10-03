import { BaseCommandHandler } from './BaseCommandHandler.js';
import { UserProfile } from '../models/UserProfile.js';
import { SettingsService } from '../services/SettingsService.js';
import { ParticipantLimitInputHandler } from './ParticipantLimitInputHandler.js';
import { SettingsPresenter, BOOLEAN_SETTING_CONTROLS } from './SettingsPresenter.js';

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
    this.presenter = new SettingsPresenter(this);
    this.participantLimitInput = new ParticipantLimitInputHandler(this);
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

    let propagationFailed = false;
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

      if (settingName === 'requireParticipationApproval') {
        const updateResult = await this.updateRideMessage(rideToRender, ctx);
        propagationFailed = !updateResult.success;
      }
    }

    await this.showRideSettings(ctx, 'edit', rideToRender);
    await ctx.answerCallbackQuery(this.translate(ctx, propagationFailed
      ? 'commands.settings.rideUpdatedMessageFailed'
      : 'commands.settings.rideUpdated'));
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
   * @param {string} value
   * @returns {boolean}
   */
  parseBooleanCallbackValue(value) {
    return value === 'on';
  }

  /**
   * @param {string} callbackKey
   * @returns {'notifyParticipation'|'allowReposts'|'requireParticipationApproval'|null}
   */
  getBooleanSettingName(callbackKey) {
    return BOOLEAN_SETTING_CONTROLS.find(control => control.callbackKey === callbackKey)?.name || null;
  }


  /** Delegate the numeric-input entry point.
   * @param {import('grammy').Context} ctx
   */
  handleUserParticipantLimitCallback(ctx) {
    return this.participantLimitInput.handleUserParticipantLimitCallback(ctx);
  }

  /** Delegate the numeric-input entry point.
   * @param {import('grammy').Context} ctx
   */
  handleRideParticipantLimitCallback(ctx) {
    return this.participantLimitInput.handleRideParticipantLimitCallback(ctx);
  }

  /** Delegate the numeric-input entry point.
   * @param {import('grammy').Context} ctx
   */
  handleParticipantLimitCancel(ctx) {
    return this.participantLimitInput.handleParticipantLimitCancel(ctx);
  }

  /** Delegate the numeric-input entry point.
   * @param {import('grammy').Context} ctx
   */
  handleTextInput(ctx) {
    return this.participantLimitInput.handleTextInput(ctx);
  }

  /** Delegate the numeric-input entry point.
   * @param {import('grammy').Context} ctx
   */
  cancelPendingParticipantLimitInput(ctx) {
    return this.participantLimitInput.cancelPendingParticipantLimitInput(ctx);
  }

  /** Render the settings interface.
   * @param {import('grammy').Context} ctx
   * @param {'reply'|'edit'} mode
   * @param {Object|null} settingsOverride
   */
  showUserSettings(ctx, mode, settingsOverride = null) {
    return this.presenter.showUserSettings(ctx, mode, settingsOverride);
  }

  /** Render the settings interface.
   * @param {import('grammy').Context} ctx
   * @param {'reply'|'edit'} mode
   * @param {Object|null} ride
   */
  showRideSettings(ctx, mode, ride) {
    return this.presenter.showRideSettings(ctx, mode, ride);
  }

}
