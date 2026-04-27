import { BaseCommandHandler } from './BaseCommandHandler.js';
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
    const helpParts = ['templates.help1', 'templates.help2', 'templates.help3'];

    for (const key of helpParts) {
      const text = ctx.t(key);
      if (text !== key) {
        await ctx.reply(await replaceBotUsername(text, ctx), { parse_mode: 'HTML' });
      }
    }
  }
}
