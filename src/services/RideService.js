import { RouteParser } from '../utils/route-parser.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';

/**
 * Service class for managing rides
 */
export class RideService {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Create a new ride
   * @param {Object} rideData - Ride data
   * @returns {Promise<Object>} - Created ride
   */
  async createRide(rideData) {
    return await this.storage.createRide(rideData);
  }

  /**
   * Update an existing ride
   * @param {string} rideId - Ride ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated ride
   */
  async updateRide(rideId, updates) {
    return await this.storage.updateRide(rideId, updates);
  }

  /**
   * Get a ride by ID
   * @param {string} rideId - Ride ID
   * @returns {Promise<Object>} - Ride object
   */
  async getRide(rideId) {
    return await this.storage.getRide(rideId);
  }

  /**
   * Delete a ride
   * @param {string} rideId - Ride ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRide(rideId) {
    return await this.storage.deleteRide(rideId);
  }

  /**
   * Get rides created by a user
   * @param {number} userId - User ID
   * @param {number} skip - Number of items to skip
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<Object>} - List of rides
   */
  async getRidesByCreator(userId, skip, limit) {
    return await this.storage.getRidesByCreator(userId, skip, limit);
  }

  /**
   * Add a participant to a ride
   * @param {string} rideId - Ride ID
   * @param {Object} participant - Participant data
   * @returns {Promise<boolean>} - Success status
   */
  async addParticipant(rideId, participant) {
    return await this.storage.addParticipant(rideId, participant);
  }

  /**
   * Remove a participant from a ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async removeParticipant(rideId, userId) {
    return await this.storage.removeParticipant(rideId, userId);
  }

  /**
   * Get all participants of a ride
   * @param {string} rideId - Ride ID
   * @returns {Promise<Array>} - List of participants
   */
  async getParticipants(rideId) {
    return await this.storage.getParticipants(rideId);
  }

  /**
   * Cancel a ride
   * @param {string} rideId - Ride ID
   * @returns {Promise<Object>} - Updated ride
   */
  async cancelRide(rideId) {
    return await this.storage.updateRide(rideId, { cancelled: true });
  }

  /**
   * Parse ride parameters from text
   * @param {string} text - Text to parse
   * @returns {Object} - Parsed parameters
   */
  parseRideParams(text) {
    const lines = text.split('\n').slice(1); // Skip command line
    const params = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [_, key, value] = match;
        params[key.trim().toLowerCase()] = value.trim();
      }
    }

    return params;
  }

  /**
   * Process route information
   * @param {string} routeUrl - Route URL
   * @returns {Promise<Object>} - Route information with optional error property
   */
  async processRouteInfo(routeUrl) {
    if (!RouteParser.isValidRouteUrl(routeUrl)) {
      return { error: 'Invalid URL format. Please provide a valid URL.' };
    }

    if (RouteParser.isKnownProvider(routeUrl)) {
      const result = await RouteParser.parseRoute(routeUrl);
      
      // Create a response object with the route link
      const response = { routeLink: routeUrl };
      
      // Add any available data from the parser
      if (result) {
        if (result.distance) response.distance = result.distance;
        if (result.duration) response.duration = result.duration;
      }
      
      return response;
    }

    // For non-supported providers, just return the URL without error
    return { routeLink: routeUrl };
  }

  /**
   * Parse date and time input
   * @param {string} input - Date/time input
   * @returns {Object} - Parsed date or error
   */
  parseDateTimeInput(input) {
    return parseDateTimeInput(input);
  }

  /**
   * Create a ride from parameters
   * @param {Object} params - Ride parameters
   * @param {number} chatId - Chat ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Created ride and any errors
   */
  async createRideFromParams(params, chatId, userId) {
    if (!params.title || !params.when) {
      return { 
        ride: null, 
        error: 'Please provide at least title and date/time.'
      };
    }

    try {
      const result = this.parseDateTimeInput(params.when);
      if (!result.date) {
        return { ride: null, error: result.error };
      }
      
      // Create ride data object
      const rideData = {
        title: params.title,
        date: result.date,
        messages: [], // Initialize with empty array instead of null messageId
        createdBy: userId
      };

      if (params.meet) {
        rideData.meetingPoint = params.meet;
      }

      if (params.route) {
        const routeInfo = await this.processRouteInfo(params.route);
        if (routeInfo.error) {
          return { ride: null, error: routeInfo.error };
        }
        
        rideData.routeLink = params.route;
        
        // Only use parsed details if not explicitly provided
        if (routeInfo.distance && !params.dist) {
          rideData.distance = routeInfo.distance;
        }
        
        if (routeInfo.duration && !params.time) {
          rideData.duration = routeInfo.duration;
        }
      }

      if (params.dist) {
        rideData.distance = parseFloat(params.dist);
      }

      if (params.time) {
        rideData.duration = parseInt(params.time);
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) rideData.speedMin = min;
        if (!isNaN(max)) rideData.speedMax = max;
      }

      const ride = await this.storage.createRide(rideData);
      return { ride, error: null };
    } catch (error) {
      console.error('Error creating ride:', error);
      return { ride: null, error: 'An error occurred while creating the ride.' };
    }
  }

  /**
   * Update a ride from parameters
   * @param {string} rideId - Ride ID
   * @param {Object} params - Update parameters
   * @returns {Promise<Object>} - Updated ride and any errors
   */
  async updateRideFromParams(rideId, params) {
    try {
      const updates = {};
      
      if (params.title) {
        updates.title = params.title;
      }
      
      if (params.when) {
        const result = this.parseDateTimeInput(params.when);
        if (!result.date) {
          return { ride: null, error: result.error };
        }
        updates.date = result.date;
      }
      
      if (params.meet) {
        updates.meetingPoint = params.meet;
      }
      
      if (params.route) {
        const routeInfo = await this.processRouteInfo(params.route);
        if (routeInfo.error) {
          return { ride: null, error: routeInfo.error };
        }
        
        updates.routeLink = params.route;
        
        // Use parsed details if available and not explicitly provided
        if (routeInfo.distance && !params.dist) {
          updates.distance = routeInfo.distance;
        }
        
        if (routeInfo.duration && !params.time) {
          updates.duration = routeInfo.duration;
        }
      }
      
      if (params.dist) {
        updates.distance = parseFloat(params.dist);
      }
      
      if (params.time) {
        updates.duration = parseInt(params.time);
      }
      
      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) updates.speedMin = min;
        if (!isNaN(max)) updates.speedMax = max;
      }
      
      const ride = await this.storage.updateRide(rideId, updates);
      return { ride, error: null };
    } catch (error) {
      console.error('Error updating ride:', error);
      return { ride: null, error: 'An error occurred while updating the ride.' };
    }
  }

  /**
   * Extract ride ID from message text or reply
   * @param {Object} message - Message object
   * @returns {Object} - Ride ID or error
   */
  extractRideId(message) {
    // First check if ID is provided in parameters
    const params = this.parseRideParams(message.text);
    if (params.id) {
      return { rideId: params.id, error: null };
    }
    
    // Then check replied message
    if (message.reply_to_message) {
      const originalMessage = message.reply_to_message.text;
      const rideIdMatch = originalMessage.match(/🎫\s*Ride\s*#(\w+)/i);
      
      if (!rideIdMatch) {
        return { 
          rideId: null, 
          error: 'Could not find ride ID in the message. Please make sure you are replying to a ride message or provide ID parameter.'
        };
      }
      return { rideId: rideIdMatch[1], error: null };
    }
    
    return { 
      rideId: null, 
      error: 'Please reply to the ride message or provide ID parameter.'
    };
  }

  /**
   * Validate if user is the creator of a ride
   * @param {Object} ride - Ride object
   * @param {number} userId - User ID
   * @returns {boolean} - True if user is creator
   */
  isRideCreator(ride, userId) {
    return ride.createdBy === userId;
  }
}
