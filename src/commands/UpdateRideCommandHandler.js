import { BaseCommandHandler } from './BaseCommandHandler.js';
import { DEFAULT_CATEGORY } from '../utils/category-utils.js';
import { getRideRoutes } from '../utils/route-links.js';

/**
 * Handler for the updateride command
 */
export class UpdateRideCommandHandler extends BaseCommandHandler {
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
   * Handle the updateride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.update.onlyCreator');
    
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

    await this.startUpdateWizard(ctx, ride);
  }

  /**
   * Handle owner action callback for ride editing.
   */
  async handleCallback(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.update.onlyCreator', 'callback');

    if (error) {
      await this.replyOrAnswerCallback(ctx, 'callback', error);
      return;
    }

    const started = await this.startUpdateWizard(ctx, ride, 'callback');
    if (started) {
      await ctx.answerCallbackQuery();
    }
  }

  /**
   * Build wizard prefill data for ride editing.
   */
  buildUpdatePrefillData(ride) {
    return {
      isUpdate: true,
      originalRideId: ride.id,
      title: ride.title,
      category: ride.category || DEFAULT_CATEGORY,
      organizer: ride.organizer,
      datetime: ride.date,
      meetingPoint: ride.meetingPoint,
      routes: getRideRoutes(ride),
      distance: ride.distance,
      duration: ride.duration,
      speedMin: ride.speedMin,
      speedMax: ride.speedMax,
      additionalInfo: ride.additionalInfo
    };
  }

  /**
   * Start the update wizard for an already loaded ride.
   */
  async startUpdateWizard(ctx, ride, responseMode = 'message') {
    return this.wizard.startWizard(ctx, this.buildUpdatePrefillData(ride), responseMode);
  }

  /**
   * Handle the updateride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} ride - Ride object
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, ride, params) {
    const { ride: updatedRide, error } = ctx.lang
      ? await this.rideService.updateRideFromParams(ride.id, params, ctx.from.id, { language: ctx.lang })
      : await this.rideService.updateRideFromParams(ride.id, params, ctx.from.id);

    if (error) {
      await ctx.reply(error);
      return;
    }

    // Update the ride message
    const result = await this.updateRideMessage(updatedRide, ctx);
    
    if (result.success) {
      const reply = this.formatUpdateResultMessage(ctx, result, this.translate(ctx, 'commands.common.actions.updated'));
      await ctx.reply(reply);
    } else {
      await ctx.reply(this.translate(ctx, 'commands.update.messageUpdateError'));
      console.error('Error updated ride:', result.error);
    }
  }


}
