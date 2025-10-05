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
    const { rideId, error } = this.rideMessagesService.extractRideId(ctx.message);
    if (!rideId) {
      await ctx.reply('Please provide a valid ride ID. Usage: /listparticipants rideID');
      return;
    }

    try {
      // Get the ride by ID
      const ride = await this.rideService.getRide(rideId);
      if (!ride) {
        await ctx.reply(`Ride #${rideId} not found.`);
        return;
      }

      // Format and send the participants list by category
      const participation = ride.participation || { joined: [], thinking: [], skipped: [] };
      const joinedCount = participation.joined.length;
      const thinkingCount = participation.thinking.length;
      const skippedCount = participation.skipped.length;
      const totalCount = joinedCount + thinkingCount + skippedCount;
      
      let message = `👥 <b>All Participants for "${escapeHtml(ride.title)}" (${totalCount})</b>\n\n`;
      
      // Always show joined participants
      message += `🚴 <b>Joined (${joinedCount}):</b>\n`;
      if (joinedCount > 0) {
        message += this.formatParticipantsByCategory(participation.joined);
      } else {
        message += 'No one joined yet.';
      }
      
      // Always add empty line after joined section
      message += '\n\n';
      
      // Show thinking participants if any
      if (thinkingCount > 0) {
        message += `🤔 <b>Thinking (${thinkingCount}):</b>\n`;
        message += this.formatParticipantsByCategory(participation.thinking);
        message += '\n\n';
      }
      
      // Show skipped participants if any
      if (skippedCount > 0) {
        message += `🙅 <b>Not interested (${skippedCount}):</b>\n`;
        message += this.formatParticipantsByCategory(participation.skipped);
        message += '\n\n';
      }
      
      // Remove trailing newlines
      message = message.trim();
      
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error listing participants:', error);
      await ctx.reply('An error occurred while retrieving participants.');
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
