/**
 * Base class for command handlers
 */
export class BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   */
  constructor(rideService, messageFormatter) {
    this.rideService = rideService;
    this.messageFormatter = messageFormatter;
  }

  /**
   * Handle a command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    throw new Error('Method not implemented');
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
    const { rideId, error } = this.rideService.extractRideId(ctx.message);
    
    if (error) {
      return { ride: null, error };
    }

    try {
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        return { ride: null, error: `Ride #${rideId} not found` };
      }

      return { ride, error: null };
    } catch (error) {
      console.error('Error extracting ride:', error);
      return { ride: null, error: 'Error accessing ride data' };
    }
  }
  
  /**
   * Update the ride message
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{success: boolean, updatedCount: number, removedCount: number, error: string|null}>}
   */
  async updateRideMessage(ride, ctx) {
    // Use the centralized method in RideService
    const result = await this.rideService.updateRideMessages(ride, ctx);
    
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
    const { params, unknownParams } = this.rideService.parseRideParams(text);
    
    if (unknownParams.length > 0) {
      const validParamsList = Object.entries(this.rideService.constructor.VALID_PARAMS)
        .map(([key, desc]) => `${key}: ${desc}`)
        .join('\n');
      
      await ctx.reply(
        `Unknown parameter(s): ${unknownParams.join(', ')}\n\n` +
        'Valid parameters are:\n' +
        validParamsList
      );
      return { params, hasUnknownParams: true };
    }
    return { params, hasUnknownParams: false };
  }
}
