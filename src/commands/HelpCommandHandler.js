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
    const helpSections = [];

    for (const key of ['templates.help1', 'templates.help2', 'templates.help3']) {
      const text = ctx.t(key);
      if (text !== key) {
        const localizedText = await replaceBotUsername(text, ctx);
        helpSections.push(localizedText);
      }
    }

    const messages = [
      helpSections[0],
      helpSections.slice(1).join('\n<hr/>\n')
    ].filter(Boolean);

    for (const html of messages) {
      await ctx.replyWithRichMessage({ html });
    }
  }
}
