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

      // Format and send the participants list by category
      const participation = ride.participation || { joined: [], thinking: [], skipped: [] };
      const joinedCount = participation.joined.length;
      const thinkingCount = participation.thinking.length;
      const skippedCount = participation.skipped.length;
      const totalCount = joinedCount + thinkingCount + skippedCount;
      
      let message = `👥 <b>${this.translate(ctx, 'commands.listParticipants.allParticipantsTitle', {
        title: escapeHtml(ride.title),
        total: totalCount
      })}</b>\n\n`;
      
      // Always show joined participants
      message += `🚴 <b>${this.translate(ctx, 'commands.listParticipants.joinedLabel', { count: joinedCount })}:</b>\n`;
      if (joinedCount > 0) {
        message += this.formatParticipantsByCategory(participation.joined);
      } else {
        message += this.translate(ctx, 'commands.listParticipants.noOneJoinedYet');
      }
      
      // Always add empty line after joined section
      message += '\n\n';
      
      // Show thinking participants if any
      if (thinkingCount > 0) {
        message += `🤔 <b>${this.translate(ctx, 'commands.listParticipants.thinkingLabel', { count: thinkingCount })}:</b>\n`;
        message += this.formatParticipantsByCategory(participation.thinking);
        message += '\n\n';
      }
      
      // Show skipped participants if any
      if (skippedCount > 0) {
        message += `🙅 <b>${this.translate(ctx, 'commands.listParticipants.notInterestedLabel', { count: skippedCount })}:</b>\n`;
        message += this.formatParticipantsByCategory(participation.skipped);
        message += '\n\n';
      }
      
      // Remove trailing newlines
      message = message.trim();
      
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error listing participants:', error);
      await ctx.reply(this.translate(ctx, 'commands.listParticipants.retrieveError'));
    }
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
