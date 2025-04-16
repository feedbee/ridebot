import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for the newride command
 */
export class NewRideCommandHandler extends BaseCommandHandler {
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
   * Handle the newride command
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} prefillData - Optional data to prefill
   */
  async handle(ctx, prefillData = null) {
    // If parameters are provided, use the parameter-based approach
    if (ctx.message.text.includes('\n')) {
      const { params, hasUnknownParams } = await this.parseRideParams(ctx, ctx.message.text);
      if (hasUnknownParams) return;
      
      return this.handleWithParams(ctx, params);
    }

    // Otherwise start the wizard
    await this.wizard.startWizard(ctx, prefillData);
  }

  /**
   * Handle the newride command with parameters
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {Object} params - Command parameters
   */
  async handleWithParams(ctx, params) {
    const { ride, error } = await this.rideService.createRideFromParams(
      params, 
      ctx.chat.id, 
      ctx.from.id
    );

    if (error) {
      await ctx.reply(error);
      return;
    }
    
    // Create the ride message using the centralized method
    await this.rideMessagesService.createRideMessage(ride, ctx);
  }
}
