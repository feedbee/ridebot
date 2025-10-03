import { RouteParser } from '../utils/route-parser.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';
import { normalizeCategory, DEFAULT_CATEGORY } from '../utils/category-utils.js';
import { parseDuration } from '../utils/duration-parser.js';

/**
 * Service class for managing rides and their messages
 */
export class RideService {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.messageFormatter = new MessageFormatter();
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
   * @param {number} [userId] - User ID of the person making the update
   * @returns {Promise<Object>} - Updated ride
   */
  async updateRide(rideId, updates, userId = null) {
    // Only set updatedBy if userId is provided and there are other updates
    if (userId !== null && Object.keys(updates).length > 0) {
      updates.updatedBy = userId;
    }
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
   * @returns {Promise<Object>} - Success status and updated ride
   */
  async joinRide(rideId, participant) {
    const result = await this.storage.addParticipant(rideId, participant);
    return result;
  }

  /**
   * Remove a participant from a ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Success status and updated ride
   */
  async leaveRide(rideId, userId) {
    const result = await this.storage.removeParticipant(rideId, userId);
    return result;
  }

  /**
   * Cancel a ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Cancelled ride
   */
  async cancelRide(rideId, userId = null) {
    const updates = {
      cancelled: true
    };
    
    if (userId !== null) {
      updates.updatedBy = userId;
    }
    
    return this.storage.updateRide(rideId, updates);
  }
  
  /**
   * Resume a cancelled ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Resumed ride
   */
  async resumeRide(rideId, userId = null) {
    const updates = {
      cancelled: false
    };
    
    if (userId !== null) {
      updates.updatedBy = userId;
    }
    
    return this.storage.updateRide(rideId, updates);
  }

  /**
   * Create a ride from parameters
   * @param {Object} params - Ride parameters
   * @param {number} chatId - Chat ID where the command was issued
   * @param {Object} user - User object with id, first_name, last_name, username fields
   * @returns {Promise<Object>} - Created ride and any errors
   */
  async createRideFromParams(params, chatId, user) {
    if (!params.title || !params.when) {
      return { 
        ride: null, 
        error: 'Please provide at least title and date/time.'
      };
    }

    try {
      const result = parseDateTimeInput(params.when);
      if (!result.date) {
        return { ride: null, error: result.error };
      }
      
      // Create ride data object
      const rideData = {
        title: params.title,
        category: params.category ? normalizeCategory(params.category) : DEFAULT_CATEGORY,
        date: result.date,
        messages: [], // Initialize with empty array instead of null messageId
        createdBy: user.id
      };
      
      // Set organizer name - use provided value or default to creator's name
      if (params.organizer) {
        rideData.organizer = params.organizer;
      } else if (user) {
        // Format organizer name in the same format as participant names but without the link
        let organizerName = '';
        if (user.first_name || user.last_name) {
          const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
          if (user.username) {
            organizerName = `${fullName} (@${user.username})`;
          } else {
            organizerName = fullName;
          }
        } else if (user.username) {
          organizerName = user.username.includes(' ') ? user.username : `@${user.username}`;
        }
        rideData.organizer = organizerName;
      }

      if (params.meet) {
        rideData.meetingPoint = params.meet;
      }

      if (params.route) {
        const routeInfo = await RouteParser.processRouteInfo(params.route);
        if (routeInfo.error) {
          return { ride: null, error: routeInfo.error };
        }
        
        rideData.routeLink = routeInfo.routeLink;
        
        // Only use parsed details if not explicitly provided
        if (routeInfo.distance && !params.dist) {
          rideData.distance = routeInfo.distance;
        }
        
        if (routeInfo.duration && !params.duration) {
          rideData.duration = routeInfo.duration;
        }
      }

      if (params.dist) {
        rideData.distance = parseFloat(params.dist);
      }

      if (params.duration) {
        const result = parseDuration(params.duration);
        if (result.error) {
          return { ride: null, error: result.error };
        }
        rideData.duration = result.duration;
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) rideData.speedMin = min;
        if (!isNaN(max)) rideData.speedMax = max;
      }

      if (params.info !== undefined) {
        rideData.additionalInfo = params.info;
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
   * @param {number} [userId] - User ID of the person updating the ride
   * @returns {Promise<Object>} - Updated ride and any errors
   */
  async updateRideFromParams(rideId, params, userId = null) {
    try {
      const updates = {};
      
      if (params.title) {
        updates.title = params.title;
      }
      
      if (params.category !== undefined) {
        // Use dash ('-') to remove the field value and set to default
        if (params.category === '-') {
          updates.category = DEFAULT_CATEGORY; // Reset to default
        } else {
          updates.category = normalizeCategory(params.category);
        }
      }
      
      if (params.organizer !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.organizer === '-') {
          updates.organizer = '';
        } else {
          updates.organizer = params.organizer;
        }
      }
      
      if (params.when) {
        const result = parseDateTimeInput(params.when);
        if (!result.date) {
          return { ride: null, error: result.error };
        }
        updates.date = result.date;
      }
      
      if (params.meet !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.meet === '-') {
          updates.meetingPoint = '';
        } else {
          updates.meetingPoint = params.meet;
        }
      }
      
      if (params.route !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.route === '-') {
          updates.routeLink = '';
        } else {
          const routeInfo = await RouteParser.processRouteInfo(params.route);
          if (routeInfo.error) {
            return { ride: null, error: routeInfo.error };
          }
          
          updates.routeLink = routeInfo.routeLink;
          
          // Use parsed details if available and not explicitly provided
          if (routeInfo.distance && !params.dist) {
            updates.distance = routeInfo.distance;
          }
          
          if (routeInfo.duration && !params.duration) {
            updates.duration = routeInfo.duration;
          }
        }
      }
      
      if (params.dist !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.dist === '-') {
          updates.distance = null;
        } else {
          updates.distance = parseFloat(params.dist);
        }
      }
      
      if (params.duration !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.duration === '-') {
          updates.duration = null;
        } else {
          const result = parseDuration(params.duration);
          if (result.error) {
            return { ride: null, error: result.error };
          }
          updates.duration = result.duration;
        }
      }
      
      if (params.speed !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.speed === '-') {
          updates.speedMin = null;
          updates.speedMax = null;
        } else {
          const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
          if (!isNaN(min)) updates.speedMin = min;
          if (!isNaN(max)) updates.speedMax = max;
        }
      }
      
      if (params.info !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.info === '-') {
          updates.additionalInfo = '';
        } else {
          updates.additionalInfo = params.info;
        }
      }
      
      // Only set updatedBy if there are other updates
      if (Object.keys(updates).length > 0 && userId !== null) {
        updates.updatedBy = userId;
      }
      
      if (Object.keys(updates).length === 0) {
        // No updates to make, return the current ride
        const ride = await this.storage.getRide(rideId);
        return { ride, error: null };
      }
      
      const ride = await this.storage.updateRide(rideId, updates);
      return { ride, error: null };
    } catch (error) {
      console.error('Error updating ride:', error);
      return { ride: null, error: 'An error occurred while updating the ride.' };
    }
  }

  /**
   * Duplicate an existing ride with optional parameter overrides
   * @param {string} originalRideId - ID of the ride to duplicate
   * @param {Object} params - Optional parameters to override
   * @param {Object} user - User object with id, first_name, last_name, username fields
   * @returns {Promise<Object>} - Created ride and any errors
   */
  async duplicateRide(originalRideId, params, user) {
    const originalRide = await this.getRide(originalRideId);
    if (!originalRide) {
      return { ride: null, error: 'Original ride not found' };
    }
    
    // Calculate tomorrow's date as default
    const tomorrow = new Date(originalRide.date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Merge params with original ride data
    // For fields that can be cleared with '-', use 'undefined' check to distinguish between not provided and explicitly set
    const mergedParams = {
      title: params.title !== undefined ? params.title : originalRide.title,
      category: params.category !== undefined ? params.category : originalRide.category,
      organizer: params.organizer !== undefined ? params.organizer : originalRide.organizer,
      meet: params.meet !== undefined ? params.meet : originalRide.meetingPoint,
      route: params.route !== undefined ? params.route : originalRide.routeLink,
      dist: params.dist !== undefined ? params.dist : originalRide.distance?.toString(),
      duration: params.duration !== undefined ? params.duration : originalRide.duration?.toString(),
      info: params.info !== undefined ? params.info : originalRide.additionalInfo
    };
    
    // Handle date with default to tomorrow
    if (params.when) {
      mergedParams.when = params.when;
    } else {
      // Format tomorrow's date for parsing
      mergedParams.when = tomorrow.toISOString();
    }
    
    // Handle speed range
    if (params.speed !== undefined) {
      mergedParams.speed = params.speed;
    } else if (originalRide.speedMin || originalRide.speedMax) {
      // Reconstruct speed range from original ride
      if (originalRide.speedMin && originalRide.speedMax) {
        mergedParams.speed = `${originalRide.speedMin}-${originalRide.speedMax}`;
      } else if (originalRide.speedMin) {
        mergedParams.speed = `${originalRide.speedMin}`;
      } else if (originalRide.speedMax) {
        mergedParams.speed = `${originalRide.speedMax}`;
      }
    }
    
    // Use existing createRideFromParams to handle all the validation and processing
    return await this.createRideFromParams(mergedParams, null, user);
  }
}
