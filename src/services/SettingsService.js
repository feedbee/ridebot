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
   * @returns {{notifyParticipation: boolean, allowReposts: boolean}}
   */
  static getSystemRideDefaults() {
    return {
      notifyParticipation: true,
      allowReposts: false
    };
  }

  /**
   * @param {Object} [baseSettings={}]
   * @param {Object} [overrideSettings={}]
   * @returns {{notifyParticipation: boolean, allowReposts: boolean}}
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
   * @returns {{notifyParticipation: boolean, allowReposts: boolean}}
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
   * @returns {{notifyParticipation?: boolean, allowReposts?: boolean}}
   */
  static extractExplicitRideSettings(input = {}) {
    return { ...(input.settings || {}) };
  }

  /**
   * Resolve effective ride settings from a ride-like object.
   *
   * @param {Object} [ride={}]
   * @returns {{notifyParticipation: boolean, allowReposts: boolean}}
   */
  static getRideSettingsSnapshot(ride = {}) {
    const explicitSettings = SettingsService.extractExplicitRideSettings(ride);
    return SettingsService.buildRideSettingsSnapshot({}, explicitSettings);
  }

  /**
   * Resolve the next persisted ride settings snapshot for an update operation.
   *
   * @param {Object} currentRide
   * @param {Object} [updates={}]
   * @returns {{notifyParticipation: boolean, allowReposts: boolean}}
   */
  static resolveUpdatedRideSettings(currentRide, updates = {}) {
    return SettingsService.buildRideSettingsSnapshot(
      SettingsService.getRideSettingsSnapshot(currentRide),
      SettingsService.extractExplicitRideSettings(updates)
    );
  }

  /**
   * @param {number} userId
   * @returns {Promise<{notifyParticipation: boolean, allowReposts: boolean}>}
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

    const existingUser = await this.storage.getUser(userProfile.userId);
    return this.storage.upsertUser({
      userId: userProfile.userId,
      username: userProfile.username,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      settings: {
        ...(existingUser?.settings || {}),
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
      settings: {
        ...(existingUser?.settings || {}),
        rideDefaults: SettingsService.getEffectiveUserRideDefaults(existingUser)
      }
    });
  }

  /**
   * Update persisted user ride defaults, creating the user record if needed.
   *
   * @param {import('../models/UserProfile.js').UserProfile} userProfile
   * @param {Object} rideDefaultsPatch
   * @returns {Promise<import('../storage/interface.js').UserEntity>}
   */
  async updateUserRideDefaults(userProfile, rideDefaultsPatch) {
    const existingUser = await this.storage.getUser(userProfile.userId);
    const mergedRideDefaults = SettingsService.buildRideSettingsSnapshot(
      existingUser?.settings?.rideDefaults,
      rideDefaultsPatch
    );

    return this.storage.upsertUser({
      userId: userProfile.userId,
      username: userProfile.username,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      settings: {
        ...(existingUser?.settings || {}),
        rideDefaults: mergedRideDefaults
      }
    });
  }

  /**
   * Resolve explicit settings for a new ride snapshot and materialize the user when required.
   *
   * @param {Object} params
   * @param {import('../models/UserProfile.js').UserProfile|null} [params.creatorProfile]
   * @param {Object} [params.input]
   * @returns {Promise<{notifyParticipation: boolean, allowReposts: boolean}>}
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
