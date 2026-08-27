import { config } from '../config.js';
import { t } from '../i18n/index.js';

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
   */
  constructor(settingsService) {
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
        name,
        title: ride.title,
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
