import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the cancelride command
 */
export class CancelRideCommandHandler extends BaseCommandHandler {
  /**
   * Handle the cancelride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract ride and validate creator
    const { ride, error } = await this.extractRide(ctx, true);
    if (error) {
      await ctx.reply(error);
      return;
    }

    if (ride.cancelled) {
      await ctx.reply('This ride is already cancelled.');
      return;
    }

    // Cancel the ride
    const updatedRide = await this.rideService.cancelRide(ride.id);
    
    // Update the ride message
    await this.updateRideMessage(updatedRide, ctx);
    await ctx.reply('Ride cancelled successfully.');
  }


}
