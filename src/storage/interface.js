/**
 * @typedef {Object} RideMessage
 * @property {number} messageId
 * @property {number} chatId
 * @property {number} [messageThreadId]
 * @property {string} [language]
 * @property {boolean} [isForCreator]
 * @property {string} [chatTitle]
 * @property {string} [chatUsername]
 * @property {number} [publishedBy]
 * @property {Date} [publishedAt]
 */

/**
 * @typedef {Object} RideRoute
 * @property {string} url
 * @property {string} [label]
 */

/**
 * @typedef {Object} RideSettings
 * @property {boolean} notifyParticipation
 * @property {boolean} allowReposts
 * @property {boolean} requireParticipationApproval
 * @property {number} participantLimit
 */

/**
 * @typedef {Object} Ride
 * @property {string} id
 * @property {Array<{userId: number, chatId: number, messageId: number}>} [applicationMessages]
 * @property {RideMessage[]} messages
 * @property {string} title
 * @property {string} [category]
 * @property {string} [organizer]
 * @property {Date} date
 * @property {RideRoute[]} [routes]
 * @property {string} [routeLink]
 * @property {string} [meetingPoint]
 * @property {number} [distance]
 * @property {number} [duration]
 * @property {number} [speedMin]
 * @property {number} [speedMax]
 * @property {number} [cruisingSpeedMin]
 * @property {number} [cruisingSpeedMax]
 * @property {string[]} [meetingPoints] - Optional multiple meeting points
 * @property {Array<{min: number|null, max: number|null}>} [speedGroups]
 * @property {Array<{min: number|null, max: number|null}>} [cruisingSpeedGroups]
 * @property {string} [chat] - Normalized Telegram coordination chat or invite link
 * @property {string} [additionalInfo]
 * @property {boolean} [cancelled]
 * @property {RideSettings} [settings]
 * @property {number} [groupId] - Telegram chat ID of the attached group
 * @property {Object} [metadata] - Arbitrary metadata (e.g. { stravaId: '123' })
 * @property {Participation} participation - User participation in different states
 * @property {Date} createdAt
 * @property {number} createdBy
 * @property {Date} [updatedAt]
 * @property {number} [updatedBy]
 */

/**
 * @typedef {Object} Participant
 * @property {number} userId
 * @property {string} [username]
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {Date} createdAt
 * @property {string} [startPoint] - Selected S1–S5; joined/thinking only
 * @property {string} [paceGroup] - Selected letter A–E; joined/thinking only
 */

/**
 * @typedef {Object} Participation
 * @property {Participant[]} joined - Users who have joined the ride
 * @property {Participant[]} thinking - Users who are thinking about joining
 * @property {Participant[]} skipped - Users who have skipped the ride
 */

/**
 * @typedef {Object} RidesList
 * @property {number} total - Total number of rides
 * @property {Array<Ride>} rides - Array of rides for current page
 */

/**
 * @typedef {Object} UserSettings
 * @property {Object} rideDefaults
 * @property {boolean} rideDefaults.notifyParticipation
 * @property {boolean} rideDefaults.allowReposts
 * @property {boolean} rideDefaults.requireParticipationApproval
 * @property {number} rideDefaults.participantLimit
 * @property {'all'|'membership'} [participationNotificationLevel]
 */

/**
 * @typedef {Object} UserEntity
 * @property {number} userId
 * @property {string} [username]
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {UserSettings} settings
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

export class StorageInterface {
  /**
   * Create a new ride
   * @param {Omit<Ride, 'id' | 'createdAt'>} ride
   * @returns {Promise<Ride>}
   */
  async createRide(ride) {
    throw new Error('Not implemented');
  }

  /** Change cancellation only for an active ride; report archival or an unchanged state. */
  async setRideCancelledIfActive(rideId, cancelled, userId) {
    throw new Error('Not implemented');
  }

  /**
   * Update an existing ride. Settings are field patches, not replacement snapshots.
   * @param {string} rideId
   * @param {Partial<Omit<Ride, 'id' | 'createdAt' | 'settings'>> & {settings?: Partial<RideSettings>}} updates
   * @returns {Promise<Ride>}
   */
  async updateRide(rideId, updates) {
    throw new Error('Not implemented');
  }

  /**
   * Get a ride by ID
   * @param {string} rideId
   * @returns {Promise<Ride>}
   */
  async getRide(rideId) {
    throw new Error('Not implemented');
  }

  /**
   * Atomically append one tracked announcement.
   * @param {string} rideId
   * @param {RideMessage} message
   * @returns {Promise<Ride>}
   */
  async addRideMessage(rideId, message) {
    throw new Error('Not implemented');
  }

  /** Atomically remove tracked messages by chat and message ID.
   * @param {string} rideId
   * @param {Array<Pick<RideMessage, 'chatId'|'messageId'>>} messages
   * @returns {Promise<Ride>}
   */
  async removeRideMessages(rideId, messages) {
    throw new Error('Not implemented');
  }


  /**
   * Set user participation state for a ride
   * @param {string} rideId - Ride ID
   * @param {'joined'|'thinking'|'skipped'} state - Participation state
   * @param {Participant} participantProfile - Participant data
   * @returns {Promise<{status: 'changed'|'already_in_state'|'participant_limit_reached', ride: Ride, previousState: 'joined'|'thinking'|'skipped'|null}>}
   */
  async setParticipation(rideId, state, participantProfile) {
    throw new Error('Not implemented');
  }

  /** Atomically set participation while the ride remains active and in the expected approval mode. */
  async setParticipationForRideMode(rideId, state, participantProfile, requireParticipationApproval, expectedState) {
    throw new Error('Not implemented');
  }

  /**
   * Atomically change participation only when the user is in the expected state.
   * @param {string} rideId
   * @param {number} userId
   * @param {'joined'|'thinking'|'skipped'} expectedState
   * @param {'joined'|'thinking'|'skipped'} targetState
   * @param {Participant} participantProfile
   * @returns {Promise<{status: 'changed'|'participant_limit_reached', ride: Ride, previousState: string}|null>}
   */
  async setParticipationIfCurrent(rideId, userId, expectedState, targetState, participantProfile) {
    throw new Error('Not implemented');
  }

  /** Conditionally select a current group for a joined/thinking user on an active ride.
   * @param {string} rideId
   * @param {number} userId
   * @param {string} group
   * @returns {Promise<{status: string, ride?: Ride}>}
   */
  async setPaceGroup(rideId, userId, group) {
    throw new Error('Not implemented');
  }

  /** Select a start point for a participating user.
   * @param {string} rideId
   * @param {number} userId
   * @param {string} group
   * @returns {Promise<Object>}
   */
  async setStartPoint(rideId, userId, group) {
    throw new Error('Not implemented');
  }

  /**
   * Get user's current participation state for a ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @returns {Promise<'joined'|'thinking'|'skipped'|null>} - Current participation state or null if not found
   */
  async getParticipation(rideId, userId) {
    throw new Error('Not implemented');
  }

  /**
   * Get all participants for a ride across all states
   * @param {string} rideId - Ride ID
   * @returns {Promise<Participation>} - All participation data
   */
  async getAllParticipants(rideId) {
    throw new Error('Not implemented');
  }

  /**
   * Delete a ride and all its participants
   * @param {string} rideId
   * @returns {Promise<boolean>}
   */
  async deleteRide(rideId) {
    throw new Error('Not implemented');
  }

  /** Track a moderation request independently of announcements.
   * @param {string} rideId
   * @param {{userId: number, chatId: number, messageId: number}} message
   */
  async addApplicationMessage(rideId, message) {
    throw new Error('Not implemented');
  }

  /** Remove one tracked moderation request.
   * @param {string} rideId
   * @param {{chatId: number, messageId: number}} message
   */
  async removeApplicationMessage(rideId, message) {
    throw new Error('Not implemented');
  }

  /**
   * Get rides created by user
   * @param {number} userId - Creator's user ID
   * @param {number} skip - Number of items to skip
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<RidesList>}
   */
  async getRidesByCreator(userId, skip, limit) {
    throw new Error('Not implemented');
  }

  /**
   * Get recently used unique group/topic destinations for a ride creator.
   * @param {number} userId
   * @param {number} limit
   * @returns {Promise<RideMessage[]>}
   */
  async getRecentPublicationDestinations(userId, limit) {
    throw new Error('Not implemented');
  }

  /**
   * Get current and future rides where a user is joined or thinking.
   * @param {number} userId - Participant's user ID
   * @param {Date} startOfToday - Inclusive date boundary
   * @param {number} skip - Number of items to skip
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<RidesList>}
   */
  async getPlannedRides(userId, startOfToday, skip, limit) {
    throw new Error('Not implemented');
  }

  /**
   * Get a ride by its attached group ID
   * @param {number} groupId - Telegram chat ID of the attached group
   * @returns {Promise<Ride|null>}
   */
  async getRideByGroupId(groupId) {
    throw new Error('Not implemented');
  }

  /**
   * Get a ride by Strava event ID and creator user ID
   * @param {string} stravaId - Strava event ID string
   * @param {number} createdBy - Creator's Telegram user ID
   * @returns {Promise<Ride|null>}
   */
  async getRideByStravaId(stravaId, createdBy) {
    throw new Error('Not implemented');
  }

  /**
   * Get a persisted user by Telegram user ID.
   * @param {number} userId
   * @returns {Promise<UserEntity|null>}
   */
  async getUser(userId) {
    throw new Error('Not implemented');
  }

  /**
   * Create or update a persisted user record. Settings and ride defaults are field patches.
   * @param {Partial<UserEntity> & { userId: number }} user
   * @param {{initializeRideDefaults?: RideSettings}} [options]
   * @returns {Promise<UserEntity>}
   */
  async upsertUser(user, options = {}) {
    throw new Error('Not implemented');
  }
} 
