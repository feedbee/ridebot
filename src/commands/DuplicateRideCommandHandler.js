import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the dupride command
 */
export class DuplicateRideCommandHandler extends BaseCommandHandler {
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
      const params = this.rideService.parseRideParams(ctx.message.text);
      return this.handleWithParams(ctx, ride, params);
    }

    // Otherwise start the wizard with prefilled data from the original ride
    const tomorrow = new Date(ride.date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const prefillData = {
      title: ride.title,
      datetime: tomorrow,
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
   * Handle the dupride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} originalRide - Original ride object
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, originalRide, params) {
    try {
      // Create a new ride data object based on the original ride
      const rideData = {
        title: params.title || originalRide.title,
        chatId: ctx.chat.id,
        createdBy: ctx.from.id,
        meetingPoint: params.meet || originalRide.meetingPoint,
        routeLink: params.route || originalRide.routeLink,
        distance: params.dist ? parseFloat(params.dist) : originalRide.distance,
        duration: params.time ? parseInt(params.time) : originalRide.duration
      };

      // Handle date - default to tomorrow if not provided
      if (params.when) {
        const result = this.rideService.parseDateTimeInput(params.when);
        if (!result.date) {
          await ctx.reply(result.error);
          return;
        }
        rideData.date = result.date;
      } else {
        // Default to tomorrow at the same time
        const tomorrow = new Date(originalRide.date);
        tomorrow.setDate(tomorrow.getDate() + 1);
        rideData.date = tomorrow;
      }

      // Handle speed
      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) rideData.speedMin = min;
        if (!isNaN(max)) rideData.speedMax = max;
      } else {
        rideData.speedMin = originalRide.speedMin;
        rideData.speedMax = originalRide.speedMax;
      }

      // Create the new ride
      const ride = await this.rideService.createRide(rideData);
      
      // Create initial message using the centralized formatter
      const participants = await this.rideService.getParticipants(ride.id);
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants, ctx.from.id);
      
      const sentMessage = await ctx.reply(message, {
        parse_mode: parseMode,
        reply_markup: keyboard
      });

      // Update the ride with the message ID
      await this.rideService.updateRide(ride.id, {
        messageId: sentMessage.message_id
      });

      await ctx.reply('Ride duplicated successfully!');
    } catch (error) {
      console.error('Error duplicating ride:', error);
      await ctx.reply('An error occurred while duplicating the ride.');
    }
  }

  /**
   * Handle the dupridex command (wizard version)
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleWizard(ctx) {
    // Extract the original ride
    const { ride, error } = await this.extractRide(ctx);
    if (error) {
      await ctx.reply(error);
      return;
    }

    // Start the wizard with prefilled data from the original ride
    const tomorrow = new Date(ride.date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const prefillData = {
      title: ride.title,
      datetime: tomorrow,
      meetingPoint: ride.meetingPoint,
      routeLink: ride.routeLink,
      distance: ride.distance,
      duration: ride.duration,
      speedMin: ride.speedMin,
      speedMax: ride.speedMax
    };

    await this.wizard.startWizard(ctx, prefillData);
  }
}
