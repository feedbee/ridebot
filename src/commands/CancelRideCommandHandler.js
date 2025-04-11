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

    if (!this.rideService.isRideCreator(ride, ctx.from.id)) {
      await ctx.reply('Only the ride creator can cancel this ride');
      return;
    }

    // Cancel the ride with user ID
    const updatedRide = await this.rideService.cancelRide(ride.id, ctx.from.id);
    
    // Update the ride message
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      if (result.updatedCount > 0) {
        await ctx.reply(`Ride cancelled successfully. Updated ${result.updatedCount} message(s).`);
      } else {
        await ctx.reply(`Ride has been cancelled, but no messages were updated. You may want to /postride the ride in the chats of your choice again, they could have been removed.`);
      }
    } else {
      await ctx.reply(`Ride has been cancelled, but there was an error updating the ride message. You may need to create a new ride message.`);
      console.error('Error cancelling ride:', result.error);
    }
  }
}
