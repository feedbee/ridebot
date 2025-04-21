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
    const { ride, error } = await this.extractRide(ctx);
    if (error) {
      await ctx.reply(error);
      return;
    }

    // Check if user is the creator
    if (!this.isRideCreator(ride, ctx.from.id)) {
      await ctx.reply('Only the ride creator can cancel this ride.');
      return;
    }

    if (ride.cancelled) {
      await ctx.reply('This ride is already cancelled.');
      return;
    }

    // Cancel the ride with user ID
    const updatedRide = await this.rideService.cancelRide(ride.id, ctx.from.id);
    
    // Update the ride message
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      let reply = '';
      if (result.updatedCount > 0) {
        reply = `Ride cancelled successfully. Updated ${result.updatedCount} message(s).`;
      } else {
        reply = `Ride has been cancelled, but no messages were updated. You may want to /postride the ride in the chats of your choice again, they could have been removed.`;
      }
      if (result.removedCount > 0) {
        reply += ` Removed ${result.removedCount} unavailable message(s).`;
      }
      await ctx.reply(reply);
    } else {
      await ctx.reply(`Ride has been cancelled, but there was an error updating the ride message. You may need to create a new ride message.`);
      console.error('Error cancelling ride:', result.error);
    }
  }
}
