import { config } from '../config.js';
import { t } from '../i18n/index.js';

const DEBOUNCE_DELAY_MS = 30_000;

/**
 * Service for sending debounced participation notifications to ride creators.
 * When a participant's status changes, a 30-second timer is started before
 * sending a DM to the creator. If the status changes again within that window,
 * the pending notification is cancelled and rescheduled with the latest state.
 */
export class NotificationService {
  constructor() {
    /** @type {Map<string, {timer: ReturnType<typeof setTimeout>, participant: Object, state: string}>} */
    this.pendingTimers = new Map();
  }

  /**
   * Schedule a participation notification with debouncing.
   * @param {import('../storage/interface.js').Ride} ride
   * @param {Object} participant - Participant data
   * @param {string} newState - New participation state ('joined'|'thinking'|'skipped')
   * @param {Object} api - Grammy bot API object
   */
  scheduleParticipationNotification(ride, participant, newState, api) {
    if (ride.notifyOnParticipation === false) return;
    if (ride.createdBy === participant.userId) return;

    const key = `${ride.id}:${participant.userId}`;
    const existing = this.pendingTimers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(async () => {
      this.pendingTimers.delete(key);
      await this._sendNotification(ride, participant, newState, api);
    }, DEBOUNCE_DELAY_MS);

    this.pendingTimers.set(key, { timer, participant, state: newState });
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
        name,
        title: ride.title
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
    const full = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.username || 'Someone';
    return p.username ? `${full} (@${p.username})` : full;
  }
}
