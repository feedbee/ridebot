import { BaseCommandHandler } from './BaseCommandHandler.js';
import { getRideRoutes } from '../utils/route-links.js';
import { UserProfile } from '../models/UserProfile.js';

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

    await this.startDuplicateWizard(ctx, ride);
  }

  /**
   * Handle owner action callback for ride duplication.
   */
  async handleCallback(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.common.onlyCreatorAction', 'callback');

    if (error) {
      await this.replyOrAnswerCallback(ctx, 'callback', error);
      return;
    }

    const started = await this.startDuplicateWizard(ctx, ride, 'callback');
    if (started) {
      await ctx.answerCallbackQuery();
    }
  }

  /**
   * Build wizard prefill data for ride duplication.
   */
  buildDuplicatePrefillData(ride) {
    const tomorrow = new Date(ride.date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      title: ride.title,
      category: ride.category,
      organizer: ride.organizer,
      datetime: tomorrow,
      meetingPoint: ride.meetingPoint,
      routes: getRideRoutes(ride),
      distance: ride.distance,
      duration: ride.duration,
      speedMin: ride.speedMin,
      speedMax: ride.speedMax,
      additionalInfo: ride.additionalInfo,
      notifyOnParticipation: ride.notifyOnParticipation ?? true
    };
  }

  /**
   * Start the duplicate wizard for an already loaded ride.
   */
  async startDuplicateWizard(ctx, ride, responseMode = 'message') {
    return this.wizard.startWizard(ctx, this.buildDuplicatePrefillData(ride), responseMode);
  }

  /**
   * Handle the dupride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} originalRide - Original ride object
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, originalRide, params) {
    const creatorProfile = UserProfile.fromTelegramUser(ctx.from);
    // Use the RideService duplicateRide method which handles all the logic
    const { ride, error } = ctx.lang
      ? await this.rideService.duplicateRide(originalRide.id, params, creatorProfile, { language: ctx.lang })
      : await this.rideService.duplicateRide(originalRide.id, params, creatorProfile);

    if (error) {
      await ctx.reply(error);
      return;
    }
    
    // Create the ride message using the centralized method
    await this.rideMessagesService.createRideMessage(ride, ctx);

    await ctx.reply(this.translate(ctx, 'commands.duplicate.success'));
  }
}
