import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the resumeride command
 */
export class ResumeRideCommandHandler extends BaseCommandHandler {
  /**
   * Handle the resumeride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract ride and validate creator
    const { ride, error } = await this.extractRide(ctx, true);
    if (error) {
      await ctx.reply(error);
      return;
    }

    if (!ride.cancelled) {
      await ctx.reply('This ride is not cancelled.');
      return;
    }

    // Resume the ride
    const updatedRide = await this.rideService.resumeRide(ride.id);
    
    // Update the ride message
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      await ctx.reply(`Ride resumed successfully. Updated ${result.updatedCount} message(s).`);
    } else {
      await ctx.reply(`Ride has been resumed, but no messages were updated. You may need to create a new ride message.`);
    }
  }
}
