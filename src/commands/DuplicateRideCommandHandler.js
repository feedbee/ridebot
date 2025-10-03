import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the dupride command
 */
export class DuplicateRideCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../wizard/RideWizard.js').RideWizard} wizard
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   */
  constructor(rideService, messageFormatter, wizard, rideMessagesService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.wizard = wizard;
  }

  /**
   * Handle the dupride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract the original ride
    const { ride, error } = await this.extractRide(ctx);
    if (error) {
      await ctx.reply(error);
      return;
    }

    // If parameters are provided, use the parameter-based approach
    if (ctx.message.text.includes('\n')) {
      const { params, hasUnknownParams } = await this.parseRideParams(ctx, ctx.message.text);
      if (hasUnknownParams) return;
      
      return this.handleWithParams(ctx, ride, params);
    }

    // Otherwise start the wizard with prefilled data from the original ride
    const tomorrow = new Date(ride.date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const prefillData = {
      title: ride.title,
      category: ride.category,
      organizer: ride.organizer,
      datetime: tomorrow,
      meetingPoint: ride.meetingPoint,
      routeLink: ride.routeLink,
      distance: ride.distance,
      duration: ride.duration,
      speedMin: ride.speedMin,
      speedMax: ride.speedMax,
      additionalInfo: ride.additionalInfo
    };

    await this.wizard.startWizard(ctx, prefillData);
  }

  /**
   * Handle the dupride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} originalRide - Original ride object
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, originalRide, params) {
    // Use the RideService duplicateRide method which handles all the logic
    const { ride, error } = await this.rideService.duplicateRide(
      originalRide.id,
      params,
      ctx.from
    );

    if (error) {
      await ctx.reply(error);
      return;
    }
    
    // Create the ride message using the centralized method
    await this.rideMessagesService.createRideMessage(ride, ctx);

    await ctx.reply('Ride duplicated successfully!');
  }
}
