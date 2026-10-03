import { config } from '../config.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from '../utils/html-escape.js';

const DEBOUNCE_DELAY_MS = 20_000;

/**
 * Service for sending debounced participation notifications to ride creators.
 * When a participant's status changes, a 20-second timer is started before
 * sending a DM to the creator. If the status changes again within that window,
 * the pending notification is cancelled and rescheduled with the latest state.
 */
export class NotificationService {
  /**
   * @param {import('./SettingsService.js').SettingsService} settingsService
   * @param {import('../storage/interface.js').StorageInterface|null} storage
   */
  constructor(settingsService, storage = null) {
    this.storage = storage;
    this.settingsService = settingsService;
    /** @type {Map<string, {timer: ReturnType<typeof setTimeout>, participant: Object, initialState: string|null, finalState: string, ride: Object, api: Object}>} */
    this.pendingTimers = new Map();
  }

  /**
   * Schedule a participation notification with debouncing.
   * @param {import('../storage/interface.js').Ride} ride
   * @param {Object} participant - Participant data
   * @param {string|null} previousState
   * @param {string} targetState
   * @param {Object} api - Grammy bot API object
   */
  scheduleParticipationNotification(ride, participant, previousState, targetState, api) {
    if (!ride.settings.notifyParticipation) return;
    if (ride.createdBy === participant.userId) return;

    const key = `${ride.id}:${participant.userId}`;
    const existing = this.pendingTimers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const initialState = existing ? existing.initialState : previousState;
    const timer = setTimeout(async () => {
      this.pendingTimers.delete(key);
      await this._deliverNotification(ride, participant, initialState, targetState, api);
    }, DEBOUNCE_DELAY_MS);

    this.pendingTimers.set(key, {
      timer,
      participant,
      initialState,
      finalState: targetState,
      ride,
      api
    });
  }

  /** Cancel a pending ordinary notification superseded by an operational moderation event. */
  cancelParticipationNotification(rideId, participantUserId) {
    const key = `${rideId}:${participantUserId}`;
    const pending = this.pendingTimers.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTimers.delete(key);
  }

  /** Send the mandatory actionable application notification immediately. */
  async sendApplicationNotification(ride, participant, api) {
    this.cancelParticipationNotification(ride.id, participant.userId);
    try {
      const language = config.i18n.defaultLanguage;
      const message = await api.sendMessage(ride.createdBy, t(language, 'commands.notifications.application', {
        name: `<a href="tg://user?id=${participant.userId}">${escapeHtml(this._formatName(participant))}</a>`,
        title: escapeHtml(ride.title),
        rideId: ride.id
      }), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: t(language, 'buttons.acceptApplication'), callback_data: `application:accept:${ride.id}:${participant.userId}` },
            { text: t(language, 'buttons.rejectApplication'), callback_data: `application:reject:${ride.id}:${participant.userId}` }
          ]]
        }
      });
      if (this.storage) await this.storage.addApplicationMessage(ride.id, {
        userId: participant.userId, chatId: ride.createdBy, messageId: message.message_id
      });
    } catch (err) {
      console.error('NotificationService: failed to send application notification:', err);
    }
  }

  /** Delete tracked requests after withdrawal or a successful decision.
   * @param {Object} ride
   * @param {number} userId
   * @param {Object} api
   */
  async deleteApplicationNotifications(ride, userId, api) {
    for (const message of ride.applicationMessages || []) {
      if (message.userId !== userId) continue;
      try {
        await api.deleteMessage(message.chatId, message.messageId);
        await this.storage.removeApplicationMessage(ride.id, message);
      } catch (err) {
        console.error('NotificationService: failed to delete application notification:', err);
      }
    }
  }

  /** Send a best-effort application decision notification to the applicant. */
  async sendApplicationDecisionNotification(ride, participantUserId, decision, api) {
    try {
      const language = config.i18n.defaultLanguage;
      await api.sendMessage(participantUserId, t(language, `commands.notifications.application${decision === 'accepted' ? 'Accepted' : 'Rejected'}`, {
        title: escapeHtml(ride.title),
        rideId: ride.id
      }), { parse_mode: 'HTML' });
    } catch (err) {
      console.error('NotificationService: failed to send application decision notification:', err);
    }
  }

  async _deliverNotification(ride, participant, initialState, finalState, api) {
    if (initialState === finalState) return;

    let level = 'all';
    try {
      level = await this.settingsService.getParticipationNotificationLevel(ride.createdBy);
    } catch (error) {
      console.error('NotificationService: failed to read participation notification level:', error);
    }

    const membershipChanged = (initialState === 'joined') !== (finalState === 'joined');
    if (level === 'membership' && !membershipChanged) return;

    await this._sendNotification(ride, participant, finalState, api);
  }

  /**
   * Send the participation notification DM to the ride creator.
   * @param {import('../storage/interface.js').Ride} ride
   * @param {Object} participant
   * @param {string} state
   * @param {Object} api
   */
  async _sendNotification(ride, participant, state, api) {
    try {
      const language = config.i18n.defaultLanguage;
      const name = this._formatName(participant);
      const text = t(language, `commands.notifications.${state}`, {
        name: escapeHtml(name),
        title: escapeHtml(ride.title),
        rideId: ride.id
      }, {
        fallbackLanguage: config.i18n.fallbackLanguage
      });
      await api.sendMessage(ride.createdBy, text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('NotificationService: failed to send notification:', err);
    }
  }

  /**
   * Format participant display name.
   * @param {Object} p - Participant object
   * @returns {string}
   */
  _formatName(p) {
    if (p.firstName || p.lastName) {
      const full = `${p.firstName || ''} ${p.lastName || ''}`.trim();
      return p.username ? `${full} (@${p.username})` : full;
    }
    if (p.username) {
      return `${p.username} (@${p.username})`;
    }
    return 'Someone';
  }
}
