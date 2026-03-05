/**
 * Base class for command handlers
 */
import { RideParamsHelper } from '../utils/RideParamsHelper.js';
import { config } from '../config.js';
import { t } from '../i18n/index.js';

export class BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   */
  constructor(rideService, messageFormatter, rideMessagesService) {
    this.rideService = rideService;
    this.messageFormatter = messageFormatter;
    this.rideMessagesService = rideMessagesService;
  }

  /**
   * Handle a command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    throw new Error('Method not implemented');
  }

  translate(ctx, key, params = {}) {
    if (ctx?.t) {
      return ctx.t(key, params);
    }
    const language = ctx?.lang || config.i18n.defaultLanguage;
    return t(language, key, params, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
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

  /**
   * Extract and validate ride
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{ride: Object|null, error: string|null}>}
   */
  async extractRide(ctx) {
    const extractOptions = ctx.lang ? { language: ctx.lang } : undefined;
    const { rideId, error } = extractOptions
      ? this.rideMessagesService.extractRideId(ctx.message, extractOptions)
      : this.rideMessagesService.extractRideId(ctx.message);
    
    if (error) {
      return { ride: null, error };
    }

    try {
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        return { ride: null, error: this.translate(ctx, 'commands.common.rideNotFoundById', { id: rideId }) };
      }

      return { ride, error: null };
    } catch (error) {
      console.error('Error extracting ride:', error);
      return { ride: null, error: this.translate(ctx, 'commands.common.errorAccessingRideData') };
    }
  }
  
  /**
   * Update the ride message
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{success: boolean, updatedCount: number, removedCount: number, error: string|null}>}
   */
  async updateRideMessage(ride, ctx) {
    // Use the centralized method in RideMessagesService
    const result = await this.rideMessagesService.updateRideMessages(ride, ctx);
    
    if (!result.success) {
      console.error('Error updating ride messages:', result.error);
    } else if (result.removedCount > 0) {
      console.info(`Removed ${result.removedCount} unavailable messages from tracking for ride ${ride.id}`);
    }
    
    return result;
  }

  /**
   * Parse ride parameters from text and handle any unknown parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {string} text - Text to parse
   * @returns {Promise<{params: Object, hasUnknownParams: boolean}>} - Parsed parameters and unknown params status
   */
  async parseRideParams(ctx, text) {
    const { params, unknownParams } = RideParamsHelper.parseRideParams(text);
    
    if (unknownParams.length > 0) {
      const validParams = RideParamsHelper.getValidParams(ctx.lang);
      const validParamsList = Object.entries(validParams)
        .map(([key, desc]) => `${key}: ${desc}`)
        .join('\n');
      
      await ctx.reply(
        `${this.translate(ctx, 'commands.common.unknownParameters', { params: unknownParams.join(', ') })}\n\n` +
        `${this.translate(ctx, 'commands.common.validParameters')}\n` +
        validParamsList
      );
      return { params, hasUnknownParams: true };
    }
    return { params, hasUnknownParams: false };
  }

  /**
   * Extract ride and validate that the user is the creator
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {string} [creatorOnlyMessage] - Custom message for non-creator users
   * @returns {Promise<{ride: Object|null, error: string|null}>}
   */
  async extractRideWithCreatorCheck(ctx, creatorOnlyMessage = null) {
    const { ride, error } = await this.extractRide(ctx);
    
    if (error) {
      return { ride: null, error };
    }
    
    if (!this.isRideCreator(ride, ctx.from.id)) {
      return { ride: null, error: creatorOnlyMessage || this.translate(ctx, 'commands.common.onlyCreatorAction') };
    }
    
    return { ride, error: null };
  }

  /**
   * Format update result message
   * @param {Object} result - Update result from updateRideMessages
   * @param {string} successAction - Action performed (e.g., "cancelled", "resumed", "updated")
   * @returns {string} - Formatted message
   */
  formatUpdateResultMessage(ctx, result, successAction) {
    let reply = '';
    if (result.updatedCount > 0) {
      reply = this.translate(ctx, 'commands.common.rideActionUpdatedMessages', {
        action: successAction,
        count: result.updatedCount
      });
    } else {
      reply = this.translate(ctx, 'commands.common.rideActionNoMessagesUpdated', {
        action: successAction
      });
    }
    if (result.removedCount > 0) {
      reply += ` ${this.translate(ctx, 'commands.common.removedUnavailableMessages', {
        count: result.removedCount
      })}`;
    }
    return reply;
  }
}
