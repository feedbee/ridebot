import { BaseCommandHandler } from './BaseCommandHandler.js';
import { config } from '../config.js';
import { replaceBotUsername } from '../utils/botUtils.js';

/**
 * Handler for the start command
 */
export class StartCommandHandler extends BaseCommandHandler {
  /**
   * Handle the start command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    const startMessage = await replaceBotUsername(config.messageTemplates.start, ctx);
    await ctx.reply(startMessage, { parse_mode: 'HTML' });
  }
}
