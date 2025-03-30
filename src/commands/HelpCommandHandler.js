import { BaseCommandHandler } from './BaseCommandHandler.js';
import { config } from '../config.js';

/**
 * Handler for the help command
 */
export class HelpCommandHandler extends BaseCommandHandler {
  /**
   * Handle the help command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    const helpMessage = config.messageTemplates.help;
    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
  }
}
