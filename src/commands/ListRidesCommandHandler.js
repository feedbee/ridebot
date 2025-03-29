import { BaseCommandHandler } from './BaseCommandHandler.js';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';

/**
 * Handler for the listrides command
 */
export class ListRidesCommandHandler extends BaseCommandHandler {
  /**
   * Handle the listrides command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Default to page 1 for command
    await this.showRidesList(ctx, 1);
  }

  /**
   * Handle callback query for list navigation
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleCallback(ctx) {
    const page = parseInt(ctx.match[1]);
    await this.showRidesList(ctx, page, true);
    await ctx.answerCallbackQuery();
  }

  /**
   * Show the rides list
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {number} page - Page number
   * @param {boolean} isEdit - Whether to edit the message or send a new one
   */
  async showRidesList(ctx, page, isEdit = false) {
    const limit = 5; // Number of rides per page
    const skip = (page - 1) * limit;
    
    const { rides, total } = await this.rideService.getRidesByCreator(
      ctx.from.id, 
      skip, 
      limit
    );
    
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const message = this.messageFormatter.formatRidesList(rides, page, totalPages);
    
    // Create navigation keyboard
    const keyboard = new InlineKeyboard();
    
    if (page > 1) {
      keyboard.text(config.buttons.previous, `list:${page - 1}`);
    }
    
    if (page < totalPages) {
      keyboard.text(config.buttons.next, `list:${page + 1}`);
    }
    
    const options = {
      parse_mode: 'HTML',
      reply_markup: keyboard.length > 0 ? keyboard : undefined
    };
    
    if (isEdit) {
      await ctx.editMessageText(message, options);
    } else {
      await ctx.reply(message, options);
    }
  }
}
