import { BaseCommandHandler } from './BaseCommandHandler.js';
import { SettingsService } from '../services/SettingsService.js';

/**
 * Handler for the shareride command
 * Allows reposting a ride to the current chat
 */
export class ShareRideCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   */
  constructor(rideService, messageFormatter, rideMessagesService) {
    super(rideService, messageFormatter, rideMessagesService);
  }

  /**
   * Handle the shareride command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract the ride ID from the command
    const extractOptions = ctx.lang ? { language: ctx.lang } : undefined;
    const { rideId, error } = extractOptions
      ? this.rideMessagesService.extractRideId(ctx.message, extractOptions)
      : this.rideMessagesService.extractRideId(ctx.message);
    if (!rideId) {
      await ctx.reply(error || this.translate(ctx, 'commands.share.invalidRideIdUsage'));
      return;
    }

    try {
      // Get the ride by ID
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        await ctx.reply(this.translate(ctx, 'commands.common.rideNotFoundByIdWithDot', { id: rideId }));
        return;
      }

      const rideSettings = SettingsService.getRideSettingsSnapshot(ride);

      // Only allow non-creators to repost when the ride explicitly permits it.
      if (!this.isRideCreator(ride, ctx.from.id) && !rideSettings.allowReposts) {
        await ctx.reply(this.translate(ctx, 'commands.share.onlyCreatorRepost'));
        return;
      }

      if (ride.cancelled) {
        await ctx.reply(this.translate(ctx, 'commands.share.cannotRepostCancelled'));
        return;
      }

      const currentChatId = ctx.chat.id;
      const currentThreadId = ctx.message.message_thread_id || null;

      // Check if the ride is already posted in the current chat and topic
      if (ride.messages && ride.messages.some(msg => 
        msg.chatId === currentChatId && 
        (msg.messageThreadId || null) === currentThreadId
      )) {
        await ctx.reply(this.translate(ctx, 'commands.share.alreadyPostedInChat', {
          topicSuffix: currentThreadId ? this.translate(ctx, 'commands.share.topicSuffix') : ''
        }), {
          message_thread_id: currentThreadId
        });
        return;
      }

      // Post the ride to the current chat
      const result = await this.shareRideToChat(ride, ctx);
      
      if (!result.success) {
        await ctx.reply(this.translate(ctx, 'commands.share.failedToPostWithError', { error: result.error }));
      }
    } catch (error) {
      console.error('Error posting ride:', error);
      await ctx.reply(this.translate(ctx, 'commands.share.postingError'));
    }
  }

  /**
   * Post a ride to the current chat
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{success: boolean, error: string|null}>} - Result
   */
  async shareRideToChat(ride, ctx) {
    try {
      const result = await this.rideMessagesService.createRideMessage(ride, ctx, ctx.message?.message_thread_id);
      return { success: true };
    } catch (error) {
      console.error('Error posting ride to chat:', error);
      
      // Handle common errors
      if (error.description) {
        if (error.description.includes('bot was blocked')) {
          return { success: false, error: this.translate(ctx, 'commands.share.botNotMemberOrBlocked') };
        } else if (error.description.includes('not enough rights')) {
          return { success: false, error: this.translate(ctx, 'commands.share.botNoPermission') };
        }
      }
      
      return { success: false, error: this.translate(ctx, 'commands.share.failedToPost') };
    }
  }
}
