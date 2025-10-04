/**
 * @typedef {Object} RideMessage
 * @property {number} messageId
 * @property {number} chatId
 */

/**
 * @typedef {Object} Ride
 * @property {string} id
 * @property {RideMessage[]} messages
 * @property {string} title
 * @property {string} [category]
 * @property {string} [organizer]
 * @property {Date} date
 * @property {string} [routeLink]
 * @property {string} [meetingPoint]
 * @property {number} [distance]
 * @property {number} [duration]
 * @property {number} [speedMin]
 * @property {number} [speedMax]
 * @property {string} [additionalInfo]
 * @property {boolean} [cancelled]
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

export class StorageInterface {
  /**
   * Create a new ride
   * @param {Omit<Ride, 'id' | 'createdAt'>} ride
   * @returns {Promise<Ride>}
   */
  async createRide(ride) {
    throw new Error('Not implemented');
  }

  /**
   * Update an existing ride
   * @param {string} rideId
   * @param {Partial<Omit<Ride, 'id' | 'createdAt'>>} updates
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
   * Set user participation state for a ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @param {'joined'|'thinking'|'skipped'} state - Participation state
   * @param {Participant} participant - Participant data
   * @returns {Promise<{ride: Ride}>} - Updated ride
   */
  async setParticipation(rideId, userId, state, participant) {
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
} 
