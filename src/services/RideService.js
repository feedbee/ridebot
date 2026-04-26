import { RouteParser } from '../utils/route-parser.js';
import { FieldProcessor } from '../utils/FieldProcessor.js';
import { config } from '../config.js';
import { t } from '../i18n/index.js';
import { getRideRoutes } from '../utils/route-links.js';
import { UserProfile } from '../models/UserProfile.js';
import { SettingsService } from './SettingsService.js';

/**
 * Service class for managing rides and their messages
 */
export class RideService {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   * @param {SettingsService} [settingsService]
   */
  constructor(storage, settingsService = new SettingsService(storage)) {
    this.storage = storage;
    this.settingsService = settingsService;
  }

  translate(language, key, params = {}) {
    return t(language || config.i18n.defaultLanguage, key, params, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
  }

  /**
   * Create a new ride
   * @param {Object} rideData - Ride data
   * @param {UserProfile|null} [creatorProfile] - Normalized creator profile
   * @returns {Promise<Object>} - Created ride
   */
  async createRide(rideData, creatorProfile = null) {
    const settings = await this.settingsService.resolveCreateRideSettings({
      creatorProfile,
      input: rideData
    });
    const ride = await this.storage.createRide({
      ...rideData,
      settings
    });

    if (!creatorProfile || creatorProfile.userId !== ride.createdBy) {
      return ride;
    }

    const result = await this.setParticipation(ride.id, creatorProfile, 'joined');
    return result.success ? result.ride : ride;
  }

  /**
   * Update an existing ride
   * @param {string} rideId - Ride ID
   * @param {Object} updates - Updates to apply
   * @param {number} [userId] - User ID of the person making the update
   * @returns {Promise<Object>} - Updated ride
   */
  async updateRide(rideId, updates, userId = null) {
    let updatesToApply = { ...updates };

    if (
      updatesToApply.settings !== undefined
    ) {
      const existingRide = await this.storage.getRide(rideId);
      if (!existingRide) {
        throw new Error('Ride not found');
      }

      updatesToApply.settings = SettingsService.resolveUpdatedRideSettings(existingRide, updatesToApply);
    }

    // Only set updatedBy if userId is provided and there are other updates
    if (userId !== null && Object.keys(updatesToApply).length > 0) {
      updatesToApply.updatedBy = userId;
    }
    return await this.storage.updateRide(rideId, updatesToApply);
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
   * Get a ride by its attached group ID
   * @param {number} groupId - Telegram chat ID
   * @returns {Promise<Object|null>} - Ride object or null
   */
  async getRideByGroupId(groupId) {
    return await this.storage.getRideByGroupId(groupId);
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
   * @param {UserProfile} participantProfile - Participant user profile
   * @param {string} state - The participation state (joined, thinking, skipped)
   * @returns {Promise<Object>} - Success status and updated ride
   */
  async setParticipation(rideId, participantProfile, state) {
    // Check if user is already in the desired state
    const currentState = await this.storage.getParticipation(rideId, participantProfile.userId);
    if (currentState === state) {
      return { success: false, ride: null };
    }

    const result = await this.storage.setParticipation(rideId, state, participantProfile);
    return { success: true, ride: result.ride, previousState: currentState };
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
   * @param {UserProfile} creatorProfile - Normalized creator profile
   * @returns {Promise<Object>} - Created ride and any errors
   */
  async createRideFromParams(params, chatId, creatorProfile, options = {}) {
    const language = options.language;
    if (!params.title || !params.when) {
      return { 
        ride: null, 
        error: this.translate(language, 'services.ride.pleaseProvideTitleAndDate')
      };
    }

    try {
      // Use FieldProcessor to handle all field processing
      const processorOptions = language ? { language } : undefined;
      const { data, error } = processorOptions
        ? FieldProcessor.processRideFields(params, false, processorOptions)
        : FieldProcessor.processRideFields(params, false);
      if (error) return { ride: null, error };
      
      const routeProcessingError = await this.processRoutesData(data, params, { language });
      if (routeProcessingError) return { ride: null, error: routeProcessingError };
      
      // Set defaults and create ride data
      const rideData = {
        ...data,
        messages: [], // Initialize with empty array
        createdBy: creatorProfile.userId
      };
      
      // Set organizer name - use provided value or default to creator's name
      rideData.organizer = this.resolveCreateOrganizer(rideData.organizer, creatorProfile, { language });

      const ride = await this.createRide(rideData, creatorProfile);
      return { ride, error: null };
    } catch (error) {
      console.error('Error creating ride:', error);
      return { ride: null, error: this.translate(language, 'services.ride.errorCreatingRide') };
    }
  }

  /**
   * Get default organizer name from user object
   * @param {UserProfile} creatorProfile - Normalized creator profile
   * @returns {string} - Formatted organizer name
   */
  getDefaultOrganizer(creatorProfile) {
    if (!creatorProfile) return '';
    
    let organizerName = '';
    if (creatorProfile.firstName || creatorProfile.lastName) {
      const fullName = `${creatorProfile.firstName || ''} ${creatorProfile.lastName || ''}`.trim();
      if (creatorProfile.username) {
        organizerName = `${fullName} (@${creatorProfile.username})`;
      } else {
        organizerName = fullName;
      }
    } else if (creatorProfile.username) {
      organizerName = creatorProfile.username.includes(' ') ? creatorProfile.username : `@${creatorProfile.username}`;
    }
    return organizerName;
  }

  /**
   * Resolve organizer value for a newly created ride.
   * @param {string} organizer
   * @param {UserProfile|null} creatorProfile
   * @param {{language?: string}} options
   * @returns {string}
   */
  resolveCreateOrganizer(organizer, creatorProfile, options = {}) {
    const references = t(
      options.language || config.i18n.defaultLanguage,
      'services.ride.selfOrganizerReferences',
      {},
      {
        fallbackLanguage: config.i18n.fallbackLanguage,
        withMissingMarker: false
      }
    );
    const normalized = typeof organizer === 'string'
      ? organizer.trim().toLowerCase().replace(/[.!?]+$/g, '')
      : '';
    const refersToCreator = Array.isArray(references) && references.includes(normalized);

    if (!organizer || refersToCreator) {
      return creatorProfile ? this.getDefaultOrganizer(creatorProfile) : '';
    }

    return organizer;
  }

  /**
   * Update a ride from parameters
   * @param {string} rideId - Ride ID
   * @param {Object} params - Update parameters
   * @param {number} [userId] - User ID of the person updating the ride
   * @returns {Promise<Object>} - Updated ride and any errors
   */
  async updateRideFromParams(rideId, params, userId = null, options = {}) {
    const language = options.language;
    try {
      // Use FieldProcessor to handle all field processing for updates
      const processorOptions = language ? { language } : undefined;
      const { data, error } = processorOptions
        ? FieldProcessor.processRideFields(params, true, processorOptions)
        : FieldProcessor.processRideFields(params, true);
      if (error) return { ride: null, error };
      
      const updates = { ...data };
      
      const routeProcessingError = await this.processRoutesData(updates, params, { language });
      if (routeProcessingError) return { ride: null, error: routeProcessingError };
      
      if (Object.keys(updates).length === 0) {
        // No updates to make, return the current ride
        const ride = await this.storage.getRide(rideId);
        return { ride, error: null };
      }
      
      const ride = await this.updateRide(rideId, updates, userId);
      return { ride, error: null };
    } catch (error) {
      console.error('Error updating ride:', error);
      return { ride: null, error: this.translate(language, 'services.ride.errorUpdatingRide') };
    }
  }

  /**
   * Duplicate an existing ride with optional parameter overrides
   * @param {string} originalRideId - ID of the ride to duplicate
   * @param {Object} params - Optional parameters to override
   * @param {UserProfile} creatorProfile - Normalized creator profile
   * @returns {Promise<Object>} - Created ride and any errors
   */
  async duplicateRide(originalRideId, params, creatorProfile, options = {}) {
    const language = options.language;
    const originalRide = await this.getRide(originalRideId);
    if (!originalRide) {
      return { ride: null, error: this.translate(language, 'services.ride.originalRideNotFound') };
    }
    
    // Calculate tomorrow's date as default
    const tomorrow = new Date(originalRide.date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Merge params with original ride data
    // For fields that can be cleared with '-', use 'undefined' check to distinguish between not provided and explicitly set
    const explicitRouteClear = (Array.isArray(params.route) && params.route.length === 1 && params.route[0] === '-')
      || params.route === '-';
    const mergedParams = {
      title: params.title !== undefined ? params.title : originalRide.title,
      category: params.category !== undefined ? params.category : originalRide.category,
      organizer: params.organizer !== undefined ? params.organizer : originalRide.organizer,
      meet: params.meet !== undefined ? params.meet : originalRide.meetingPoint,
      route: explicitRouteClear
        ? []
        : params.route !== undefined
        ? params.route
        : getRideRoutes(originalRide).map(route => route.label ? `${route.label} | ${route.url}` : route.url),
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
      // Reconstruct speed string from original ride, preserving the form type
      const { speedMin, speedMax } = originalRide;
      if (speedMin && speedMax && speedMin === speedMax) {
        mergedParams.speed = `${speedMin}`;           // average: plain number
      } else if (speedMin && speedMax) {
        mergedParams.speed = `${speedMin}-${speedMax}`;
      } else if (speedMin) {
        mergedParams.speed = `${speedMin}+`;          // explicit min, not avg
      } else if (speedMax) {
        mergedParams.speed = `-${speedMax}`;          // explicit max
      }
    }
    
    // Copy notify preference from original ride if not explicitly provided
    if (params['settings.notifyParticipation'] === undefined && originalRide.createdBy === creatorProfile.userId) {
      mergedParams['settings.notifyParticipation'] = originalRide.settings.notifyParticipation
        ? 'yes'
        : 'no';
    }

    // Use existing createRideFromParams to handle all the validation and processing
    return await this.createRideFromParams(mergedParams, null, creatorProfile, { language });
  }
  async processRoutesData(data, params, options = {}) {
    if (!data._requiresRouteProcessing) {
      return null;
    }

    const language = options.language;
    let firstDistance = null;
    let firstDuration = null;
    const processedRoutes = [];

    for (const route of data.routes || []) {
      const routeOptions = language ? { language } : undefined;
      const routeInfo = routeOptions
        ? await RouteParser.processRouteInfo(route.url, routeOptions)
        : await RouteParser.processRouteInfo(route.url);
      if (routeInfo.error) {
        return routeInfo.error;
      }

      processedRoutes.push(route.label ? { url: routeInfo.routeLink, label: route.label } : { url: routeInfo.routeLink });

      if (firstDistance === null && routeInfo.distance) {
        firstDistance = routeInfo.distance;
      }
      if (firstDuration === null && routeInfo.duration) {
        firstDuration = routeInfo.duration;
      }
    }

    data.routes = processedRoutes;
    data.routeLink = processedRoutes[0]?.url || '';

    if (firstDistance !== null && !params.dist) {
      data.distance = firstDistance;
    }

    if (firstDuration !== null && !params.duration) {
      data.duration = firstDuration;
    }

    delete data._requiresRouteProcessing;
    return null;
  }
}
