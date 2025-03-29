import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the updateride command
 */
export class UpdateRideCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../wizard/RideWizard.js').RideWizard} wizard
   */
  constructor(rideService, messageFormatter, wizard) {
    super(rideService, messageFormatter);
    this.wizard = wizard;
  }

  /**
   * Handle the updateride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract ride and validate creator
    const { ride, error } = await this.extractRide(ctx, true);
    if (error) {
      await ctx.reply(error);
      return;
    }

    // If parameters are provided, use the parameter-based approach
    if (ctx.message.text.includes('\n')) {
      const params = this.rideService.parseRideParams(ctx.message.text);
      return this.handleWithParams(ctx, ride, params);
    }

    // Otherwise start the wizard with prefilled data
    const prefillData = {
      isUpdate: true,
      originalRideId: ride.id,
      title: ride.title,
      datetime: ride.date,
      meetingPoint: ride.meetingPoint,
      routeLink: ride.routeLink,
      distance: ride.distance,
      duration: ride.duration,
      speedMin: ride.speedMin,
      speedMax: ride.speedMax
    };

    await this.wizard.startWizard(ctx, prefillData);
  }

  /**
   * Handle the updateride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} ride - Ride object
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, ride, params) {
    const { ride: updatedRide, error } = await this.rideService.updateRideFromParams(
      ride.id, 
      params
    );

    if (error) {
      await ctx.reply(error);
      return;
    }

    // Update the ride message
    await this.updateRideMessage(updatedRide, ctx);
    await ctx.reply('Ride updated successfully!');
  }

  /**
   * Update the ride message
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async updateRideMessage(ride, ctx) {
    if (!ride.messageId || !ride.chatId) {
      return;
    }

    try {
      const participants = await this.rideService.getParticipants(ride.id);
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants, ctx.from.id);
      
      await ctx.api.editMessageText(
        ride.chatId,
        ride.messageId,
        message,
        {
          parse_mode: parseMode,
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error('Error updating ride message:', error);
    }
  }
}
