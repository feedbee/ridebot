import { RouteParser } from '../utils/route-parser.js';
import { FieldProcessor } from '../utils/FieldProcessor.js';

/**
 * Service class for managing rides and their messages
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
   * Set participant state for a ride
   * @param {string} rideId - Ride ID
   * @param {Object} participant - Participant data
   * @param {string} state - The participation state (joined, thinking, skipped)
   * @returns {Promise<Object>} - Success status and updated ride
   */
  async setParticipation(rideId, participant, state) {
    // Check if user is already in the desired state
    const currentState = await this.storage.getParticipation(rideId, participant.userId);
    if (currentState === state) {
      return { success: false, ride: null };
    }

    const result = await this.storage.setParticipation(rideId, participant.userId, state, participant);
    return { success: true, ride: result.ride };
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
      // Use FieldProcessor to handle all field processing
      const { data, error } = FieldProcessor.processRideFields(params, false);
      if (error) return { ride: null, error };
      
      // Handle route processing (async)
      if (data._requiresRouteProcessing) {
        const routeInfo = await RouteParser.processRouteInfo(data._routeParam);
        if (routeInfo.error) return { ride: null, error: routeInfo.error };
        
        data.routeLink = routeInfo.routeLink;
        
        // Only use parsed details if not explicitly provided
        if (routeInfo.distance && !params.dist) {
          data.distance = routeInfo.distance;
        }
        
        if (routeInfo.duration && !params.duration) {
          data.duration = routeInfo.duration;
        }
        
        delete data._routeParam;
        delete data._requiresRouteProcessing;
      }
      
      // Set defaults and create ride data
      const rideData = {
        ...data,
        messages: [], // Initialize with empty array
        createdBy: user.id
      };
      
      // Set organizer name - use provided value or default to creator's name
      if (!rideData.organizer && user) {
        rideData.organizer = this.getDefaultOrganizer(user);
      }

      const ride = await this.storage.createRide(rideData);
      return { ride, error: null };
    } catch (error) {
      console.error('Error creating ride:', error);
      return { ride: null, error: 'An error occurred while creating the ride.' };
    }
  }

  /**
   * Get default organizer name from user object
   * @param {Object} user - User object with id, first_name, last_name, username fields
   * @returns {string} - Formatted organizer name
   */
  getDefaultOrganizer(user) {
    if (!user) return '';
    
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
    return organizerName;
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
      // Use FieldProcessor to handle all field processing for updates
      const { data, error } = FieldProcessor.processRideFields(params, true);
      if (error) return { ride: null, error };
      
      const updates = { ...data };
      
      // Handle route processing (async)
      if (data._requiresRouteProcessing) {
        const routeInfo = await RouteParser.processRouteInfo(data._routeParam);
        if (routeInfo.error) return { ride: null, error: routeInfo.error };
        
        updates.routeLink = routeInfo.routeLink;
        
        // Use parsed details if available and not explicitly provided
        if (routeInfo.distance && !params.dist) {
          updates.distance = routeInfo.distance;
        }
        
        if (routeInfo.duration && !params.duration) {
          updates.duration = routeInfo.duration;
        }
        
        delete updates._routeParam;
        delete updates._requiresRouteProcessing;
      }
      
      // Field mapping is now handled by FieldProcessor
      
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
