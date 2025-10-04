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

      // Format and send the participants list
      const participants = ride.participants || [];
      const participantsList = this.formatAllParticipants(participants);
      const participantCount = participants.length;
      const message = `👥 <b>All Participants for "${escapeHtml(ride.title)}" (${participantCount})</b>\n\n${participantsList}`;
      
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error listing participants:', error);
      await ctx.reply('An error occurred while retrieving participants.');
    }
  }

  /**
   * Format all participants without truncation
   * @param {Array} participants - List of participants
   * @returns {string} - Formatted participants list
   */
  formatAllParticipants(participants) {
    if (participants.length === 0) {
      return 'No participants yet.';
    }

    return participants
      .map((participant, index) => {
        const displayName = this.messageFormatter.formatParticipant(participant);
        return `${index + 1}. ${displayName}`;
      })
      .join('\n');
  }
}
