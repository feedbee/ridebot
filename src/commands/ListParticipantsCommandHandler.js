import { BaseCommandHandler } from './BaseCommandHandler.js';
import { escapeHtml } from '../utils/html-escape.js';

/**
 * Handler for the listparticipants command
 */
export class ListParticipantsCommandHandler extends BaseCommandHandler {
  /**
   * Handle the listparticipants command
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handle(ctx) {
    // Extract the ride ID from the command
    const extractOptions = ctx.lang ? { language: ctx.lang } : undefined;
    const { rideId } = extractOptions
      ? this.rideMessagesService.extractRideId(ctx.message, extractOptions)
      : this.rideMessagesService.extractRideId(ctx.message);
    if (!rideId) {
      await ctx.reply(this.translate(ctx, 'commands.listParticipants.invalidRideIdUsage'));
      return;
    }

    try {
      // Get the ride by ID
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        await ctx.reply(this.translate(ctx, 'commands.common.rideNotFoundByIdWithDot', { id: rideId }));
        return;
      }

      await this.showParticipants(ctx, ride);
    } catch (error) {
      console.error('Error listing participants:', error);
      await ctx.reply(this.translate(ctx, 'commands.listParticipants.retrieveError'));
    }
  }

  /**
   * Handle owner action callback for listing participants.
   */
  async handleCallback(ctx) {
    const { ride, error } = await this.extractRideWithCreatorCheck(ctx, 'commands.common.onlyCreatorAction', 'callback');

    if (error) {
      await this.replyOrAnswerCallback(ctx, 'callback', error);
      return;
    }

    await this.showParticipants(ctx, ride);
    await ctx.answerCallbackQuery();
  }

  /**
   * Send the formatted participants list for a loaded ride.
   */
  async showParticipants(ctx, ride) {
    await ctx.reply(this.buildParticipantsMessage(ctx, ride), { parse_mode: 'HTML' });
  }

  /**
   * Build the participants list message body.
   */
  buildParticipantsMessage(ctx, ride) {
    const participation = ride.participation || { joined: [], thinking: [], skipped: [] };
    const joinedCount = participation.joined.length;
    const thinkingCount = participation.thinking.length;
    const skippedCount = participation.skipped.length;
    const totalCount = joinedCount + thinkingCount + skippedCount;

    let message = `👥 <b>${this.translate(ctx, 'commands.listParticipants.allParticipantsTitle', {
      title: escapeHtml(ride.title),
      total: totalCount
    })}</b>\n\n`;

    message += `🚴 <b>${this.translate(ctx, 'commands.listParticipants.joinedLabel', { count: joinedCount })}:</b>\n`;
    if (joinedCount > 0) {
      message += this.formatParticipantsByCategory(participation.joined);
    } else {
      message += this.translate(ctx, 'commands.listParticipants.noOneJoinedYet');
    }

    message += '\n\n';

    if (thinkingCount > 0) {
      message += `🤔 <b>${this.translate(ctx, 'commands.listParticipants.thinkingLabel', { count: thinkingCount })}:</b>\n`;
      message += this.formatParticipantsByCategory(participation.thinking);
      message += '\n\n';
    }

    if (skippedCount > 0) {
      message += `🙅 <b>${this.translate(ctx, 'commands.listParticipants.notInterestedLabel', { count: skippedCount })}:</b>\n`;
      message += this.formatParticipantsByCategory(participation.skipped);
      message += '\n\n';
    }

    return message.trim();
  }

  /**
   * Format participants by category without truncation
   * @param {Array} participants - List of participants
   * @returns {string} - Formatted participants list
   */
  formatParticipantsByCategory(participants) {
    if (participants.length === 0) {
      return '';
    }

    return participants
      .map((participant, index) => {
        const displayName = this.messageFormatter.formatParticipant(participant);
        return `${index + 1}. ${displayName}`;
      })
      .join('\n');
  }
}
