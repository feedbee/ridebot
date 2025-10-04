import { BaseCommandHandler } from './BaseCommandHandler.js';
import { config } from '../config.js';
import { replaceBotUsername } from '../utils/botUtils.js';

/**
 * Handler for the help command
 */
export class HelpCommandHandler extends BaseCommandHandler {
  /**
   * Handle the help command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Send both parts of the help message to avoid Telegram's message size limit
    await ctx.reply(await replaceBotUsername(config.messageTemplates.help1, ctx), { parse_mode: 'HTML' });
    await ctx.reply(await replaceBotUsername(config.messageTemplates.help2, ctx), { parse_mode: 'HTML' });
  }
}
