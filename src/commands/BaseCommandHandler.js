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
   * Extract and validate ride
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {boolean} requireCreator - Whether the command requires ride creator permissions
   * @returns {Promise<{ride: Object|null, error: string|null}>}
   */
  async extractRide(ctx, requireCreator = false) {
    const { rideId, error } = this.rideService.extractRideId(ctx.message);
    
    if (error) {
      return { ride: null, error };
    }

    try {
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        return { ride: null, error: `Ride #${rideId} not found` };
      }

      if (requireCreator && !this.rideService.isRideCreator(ride, ctx.from.id)) {
        return { ride: null, error: 'Only the ride creator can perform this action' };
      }

      return { ride, error: null };
    } catch (error) {
      console.error('Error extracting ride:', error);
      return { ride: null, error: 'Error accessing ride data' };
    }
  }
}
