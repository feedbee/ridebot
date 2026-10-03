import { RIDE_SETTING_DEFAULTS } from '../models/ride-settings.js';

/**
 * Application service for user defaults and ride settings snapshots.
 */
export class SettingsService {
  static PARTICIPATION_NOTIFICATION_LEVELS = Object.freeze({
    ALL: 'all',
    MEMBERSHIP: 'membership'
  });

  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * @returns {import('../storage/interface.js').RideSettings}
   */
  static getSystemRideDefaults() {
    return { ...RIDE_SETTING_DEFAULTS };
  }

  /**
   * @param {Object} [baseSettings={}]
   * @param {Object} [overrideSettings={}]
   * @returns {import('../storage/interface.js').RideSettings}
   */
  static buildRideSettingsSnapshot(baseSettings = {}, overrideSettings = {}) {
    return {
      ...SettingsService.getSystemRideDefaults(),
      ...(baseSettings || {}),
      ...(overrideSettings || {})
    };
  }

  /**
   * @param {Object|null} user
   * @returns {import('../storage/interface.js').RideSettings}
   */
  static getEffectiveUserRideDefaults(user) {
    return SettingsService.buildRideSettingsSnapshot(user?.settings?.rideDefaults);
  }

  /**
   * @param {string|undefined} value
   * @returns {'all'|'membership'}
   */
  static resolveParticipationNotificationLevel(value) {
    return value === SettingsService.PARTICIPATION_NOTIFICATION_LEVELS.MEMBERSHIP
      ? SettingsService.PARTICIPATION_NOTIFICATION_LEVELS.MEMBERSHIP
      : SettingsService.PARTICIPATION_NOTIFICATION_LEVELS.ALL;
  }

  /**
   * @param {Object} [input={}]
   * @returns {Partial<import('../storage/interface.js').RideSettings>}
   */
  static extractExplicitRideSettings(input = {}) {
    return { ...(input.settings || {}) };
  }

  /**
   * Resolve effective ride settings from a ride-like object.
   *
   * @param {Object} [ride={}]
   * @returns {import('../storage/interface.js').RideSettings}
   */
  static getRideSettingsSnapshot(ride = {}) {
    const explicitSettings = SettingsService.extractExplicitRideSettings(ride);
    return SettingsService.buildRideSettingsSnapshot({}, explicitSettings);
  }

  /**
   * @param {number} userId
   * @returns {Promise<import('../storage/interface.js').RideSettings>}
   */
  async getUserRideDefaults(userId) {
    const existingUser = await this.storage.getUser(userId);
    return SettingsService.getEffectiveUserRideDefaults(existingUser);
  }

  /**
   * Read the live participation notification preference without creating a user.
   * @param {number} userId
   * @returns {Promise<'all'|'membership'>}
   */
  async getParticipationNotificationLevel(userId) {
    const user = await this.storage.getUser(userId);
    return SettingsService.resolveParticipationNotificationLevel(
      user?.settings?.participationNotificationLevel
    );
  }

  /**
   * @param {import('../models/UserProfile.js').UserProfile} userProfile
   * @param {'all'|'membership'} level
   * @returns {Promise<import('../storage/interface.js').UserEntity>}
   */
  async updateParticipationNotificationLevel(userProfile, level) {
    const resolvedLevel = SettingsService.resolveParticipationNotificationLevel(level);
    if (resolvedLevel !== level) {
      throw new Error(`Unsupported participation notification level: ${level}`);
    }

    return this.storage.upsertUser({
      userId: userProfile.userId,
      username: userProfile.username,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      settings: {
        participationNotificationLevel: level
      }
    });
  }

  /**
   * Ensure the user exists with persisted defaults.
   *
   * @param {import('../models/UserProfile.js').UserProfile} userProfile
   * @returns {Promise<import('../storage/interface.js').UserEntity>}
   */
  async ensureUserWithRideDefaults(userProfile) {
    const existingUser = await this.storage.getUser(userProfile.userId);
    if (existingUser?.settings?.rideDefaults) {
      return existingUser;
    }

    return this.storage.upsertUser({
      userId: userProfile.userId,
      username: userProfile.username,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
    }, { initializeRideDefaults: SettingsService.getSystemRideDefaults() });
  }

  /**
   * Update persisted user ride defaults, creating the user record if needed.
   *
   * @param {import('../models/UserProfile.js').UserProfile} userProfile
   * @param {Object} rideDefaultsPatch
   * @returns {Promise<import('../storage/interface.js').UserEntity>}
   */
  async updateUserRideDefaults(userProfile, rideDefaultsPatch) {
    await this.ensureUserWithRideDefaults(userProfile);
    return this.storage.upsertUser({
      userId: userProfile.userId,
      username: userProfile.username,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      settings: {
        rideDefaults: rideDefaultsPatch
      }
    });
  }

  /**
   * Resolve explicit settings for a new ride snapshot and materialize the user when required.
   *
   * @param {Object} params
   * @param {import('../models/UserProfile.js').UserProfile|null} [params.creatorProfile]
   * @param {Object} [params.input]
   * @returns {Promise<import('../storage/interface.js').RideSettings>}
   */
  async resolveCreateRideSettings({ creatorProfile = null, input = {} } = {}) {
    const explicitRideSettings = SettingsService.extractExplicitRideSettings(input);

    if (!creatorProfile) {
      return SettingsService.buildRideSettingsSnapshot(
        SettingsService.getSystemRideDefaults(),
        explicitRideSettings
      );
    }

    const creatorUser = await this.ensureUserWithRideDefaults(creatorProfile);
    return SettingsService.buildRideSettingsSnapshot(
      SettingsService.getEffectiveUserRideDefaults(creatorUser),
      explicitRideSettings
    );
  }
}
