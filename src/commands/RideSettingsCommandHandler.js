import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Placeholder handler for future ride settings UX
 */
export class RideSettingsCommandHandler extends BaseCommandHandler {
  /**
   * Handle owner action callback for the placeholder settings button.
   */
  async handleCallback(ctx) {
    const { error } = await this.extractRideWithCreatorCheck(ctx, 'commands.common.onlyCreatorAction', 'callback');

    await this.replyOrAnswerCallback(
      ctx,
      'callback',
      error || this.translate(ctx, 'commands.ownerActions.settingsComingSoon')
    );
  }
}
