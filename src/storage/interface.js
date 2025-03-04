/**
 * @typedef {Object} Ride
 * @property {string} id
 * @property {number} messageId
 * @property {number} chatId
 * @property {string} title
 * @property {Date} date
 * @property {string} [routeLink]
 * @property {string} [meetingPoint]
 * @property {number} [distance]
 * @property {number} [duration]
 * @property {number} [speedMin]
 * @property {number} [speedMax]
 * @property {boolean} [cancelled]
 * @property {Date} createdAt
 * @property {number} createdBy
 */

/**
 * @typedef {Object} Participant
 * @property {number} userId
 * @property {string} username
 * @property {Date} joinedAt
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
   * Add a participant to a ride
   * @param {string} rideId
   * @param {Omit<Participant, 'joinedAt'>} participant
   * @returns {Promise<boolean>}
   */
  async addParticipant(rideId, participant) {
    throw new Error('Not implemented');
  }

  /**
   * Remove a participant from a ride
   * @param {string} rideId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async removeParticipant(rideId, userId) {
    throw new Error('Not implemented');
  }

  /**
   * Get all participants of a ride
   * @param {string} rideId
   * @returns {Promise<Participant[]>}
   */
  async getParticipants(rideId) {
    throw new Error('Not implemented');
  }
} 
