import { config } from '../config.js';
import { escapeHtml } from '../utils/html-escape.js';
import { InlineKeyboard } from 'grammy';
import { DateParser } from '../utils/date-parser.js';

/**
 * Handles formatting messages for display
 */
export class MessageFormatter {
  /**
   * Telegram's message length limit
   */
  static MAX_MESSAGE_LENGTH = 4096;

  /**
   * Format a ride message with keyboard
   * @param {Object} ride - Ride object
   * @param {Object} participation - Participation object with joined, thinking, skipped arrays
   * @param {Object} options - Additional options for formatting
   * @param {boolean} options.isForCreator - Whether this message is for the ride creator
   * @returns {Object} - Object containing message text and keyboard
   */
  formatRideWithKeyboard(ride, participation, options = {}) {
    let message = this.formatRideMessage(ride, participation, options);
    
    // Truncate if message exceeds Telegram's limit
    if (message.length > MessageFormatter.MAX_MESSAGE_LENGTH) {
      const truncateMarker = '\n\n... (message truncated due to length)';
      const maxLength = MessageFormatter.MAX_MESSAGE_LENGTH - truncateMarker.length;
      message = message.substring(0, maxLength) + truncateMarker;
    }
    
    const keyboard = this.getRideKeyboard(ride);
    
    return {
      message,
      keyboard,
      parseMode: 'HTML'
    };
  }

  /**
   * Get a standard ride keyboard with join/thinking/skip buttons
   * @param {Object} ride - Ride object
   * @returns {InlineKeyboard} - Keyboard markup
   */
  getRideKeyboard(ride) {
    const keyboard = new InlineKeyboard();
    
    // Don't add participation buttons for cancelled rides
    if (!ride.cancelled) {
      // Show all three participation buttons
      keyboard.text(config.buttons.join, `join:${ride.id}`);
      keyboard.text(config.buttons.thinking, `thinking:${ride.id}`);
      keyboard.text(config.buttons.pass, `skip:${ride.id}`);
    }
    
    return keyboard;
  }

  /**
   * Format participants list with consistent display logic
   * @param {Array} participants - Array of participant objects
   * @param {string} emptyMessage - Message to show when no participants
   * @returns {string} - Formatted participants list
   */
  formatParticipantsWithLogic(participants, emptyMessage = 'No participants yet') {
    return participants.length > 0
      ? this.formatParticipantsList(participants)
      : emptyMessage;
  }

  /**
   * Format a ride message
   * @param {Object} ride - Ride object
   * @param {Object} participation - Participation object with joined, thinking, skipped arrays
   * @param {Object} options - Additional options for formatting
   * @param {boolean} options.isForCreator - Whether this message is for the ride creator
   * @returns {string} - Formatted message
   */
  formatRideMessage(ride, participation, options = {}) {
    // Use DateParser for consistent timezone handling
    const formattedDateTime = DateParser.formatDateTime(ride.date);
    const datetime = `${formattedDateTime.date} at ${formattedDateTime.time}`;
    
    // Extract all participation categories
    const joinedParticipants = participation?.joined || [];
    const thinkingParticipants = participation?.thinking || [];
    const skippedParticipants = participation?.skipped || [];
    
    // Format participant counts and lists
    const participantCount = joinedParticipants.length;
    const thinkingCount = thinkingParticipants.length;
    const notInterestedCount = skippedParticipants.length;
    
    const participantsList = this.formatParticipantsWithLogic(joinedParticipants, 'No one joined yet');
    
    // Conditional content - show empty content for hidden sections to avoid empty lines
    const thinkingContent = thinkingCount > 0 
      ? this.formatParticipantsList(thinkingParticipants)
      : '';
    
    const notInterestedContent = notInterestedCount > 0
      ? notInterestedCount.toString()
      : '';
    
    // Build ride details with proper grouping
    let rideDetails = '';
    
    // Group 1: Title is already handled in the template
    
    // Group 2: When and Category
    let group2 = `📅 When: ${datetime}\n`;
    if (ride.category) {
      group2 += `🚵 Category: ${escapeHtml(ride.category)}\n`;
    }
    rideDetails += group2;
    
    // Group 3: Organizer, Meeting point, Route
    let group3 = '';
    if (ride.organizer) {
      group3 += `👤 Organizer: ${escapeHtml(ride.organizer)}\n`;
    }
    if (ride.meetingPoint) {
      group3 += `📍 Meeting point: ${escapeHtml(ride.meetingPoint)}\n`;
    }
    if (ride.routeLink) {
      group3 += `🔄 Route: <a href="${ride.routeLink}">Link</a>\n`;
    }
    if (group3) {
      rideDetails += `\n${group3}`;
    }
    
    // Group 4: Distance, Duration, Speed
    let group4 = '';
    if (ride.distance) {
      group4 += `📏 Distance: ${ride.distance} km\n`;
    }
    if (ride.duration) {
      group4 += `⏱ Duration: ${this.formatDuration(ride.duration)}\n`;
    }
    if (ride.speedMin || ride.speedMax) {
      group4 += `⚡ Speed: ${this.formatSpeedRange(ride.speedMin, ride.speedMax)}\n`;
    }
    if (group4) {
      rideDetails += `\n${group4}`;
    }
    
    // Group 5: Additional info
    if (ride.additionalInfo) {
      rideDetails += `\nℹ️ Additional info: ${escapeHtml(ride.additionalInfo)}\n`;
    }
    
    // Convert Markdown template to HTML
    let message = config.messageTemplates.ride
      .replace(/\*([^*]+)\*/g, '<b>$1</b>') // Bold text
      .replace('{title}', escapeHtml(ride.title))
      .replace('{cancelledBadge}', ride.cancelled ? ` ${config.messageTemplates.cancelled}` : '')
      .replace('{rideDetails}', rideDetails)
      .replace('{participantCount}', participantCount)
      .replace('{participants}', participantsList)
      .replace('{thinkingCount}', thinkingCount)
      .replace('{thinking}', thinkingContent)
      .replace('{notInterestedCount}', notInterestedContent);
    
    // Add cancellation instructions if the ride is cancelled
    const cancelledInstructions = ride.cancelled ? '\n\n' + config.messageTemplates.cancelledMessage : '';
    message = message.replace('{cancelledInstructions}', cancelledInstructions);

    // Add share line for ride creator in private chat
    const shareLine = options.isForCreator ? `Share this ride: <code>/shareride #${ride.id}</code>\n\n` : '';
    message = message.replace('{shareLine}', shareLine);

    message = message.replace('{id}', ride.id);
    
    // Remove lines that contain only emoji and empty content (e.g., "🤔 Thinking (0): ")
    message = message.replace(/🤔 Thinking \(0\): \n/g, '');
    message = message.replace(/🙅 Not interested: \n/g, '');
    
    return message;
  }

  /**
   * Format a list of rides
   * @param {Array} rides - List of rides
   * @param {number} page - Current page
   * @param {number} totalPages - Total number of pages
   * @returns {string} - Formatted message
   */
  formatRidesList(rides, page, totalPages) {
    if (rides.length === 0) {
      return 'You have not created any rides yet.';
    }
    
    let message = '🚲 <b>Your Rides</b>\n\n';
    
    for (const ride of rides) {
      // Use DateParser for consistent timezone handling
      const formattedDateTime = DateParser.formatDateTime(ride.date);
      const datetime = `${formattedDateTime.date} at ${formattedDateTime.time}`;
      const status = ride.cancelled ? '❌ CANCELLED' : '';
      
      message += `<b>${escapeHtml(ride.title)}</b> ${status}\n`;
      message += `📅 ${datetime}\n`;
      
      if (ride.meetingPoint) {
        message += `📍 ${escapeHtml(ride.meetingPoint)}\n`;
      }
      
      // Add chat information
      if (ride.messages && ride.messages.length > 0) {
        const chatCount = ride.messages.length;
        message += `📢 Posted in ${chatCount} ${chatCount === 1 ? 'chat' : 'chats'}\n`;
      } else {
        message += `📢 Not posted in any chats\n`;
      }
      
      message += `🎫 #Ride #${ride.id}\n\n`;
    }
    
    if (totalPages > 1) {
      message += `\nPage ${page}/${totalPages}`;
    }
    
    return message;
  }

  /**
   * Format a duration in minutes to a human-readable string
   * @param {number} minutes - Duration in minutes
   * @returns {string} - Formatted duration
   */
  formatDuration(minutes) {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} h`;
    }
    
    return `${hours} h ${remainingMinutes} min`;
  }

  /**
   * Format a speed range
   * @param {number|null} min - Minimum speed
   * @param {number|null} max - Maximum speed
   * @returns {string} - Formatted speed range
   */
  formatSpeedRange(min, max) {
    if (min && max) {
      return `${min}-${max} km/h`;
    }
    
    if (min) {
      return `${min}+ km/h`;
    }
    
    if (max) {
      return `up to ${max} km/h`;
    }
    
    return '';
  }

  /**
   * Format a delete confirmation message
   * @returns {string} - Confirmation message
   */
  formatDeleteConfirmation() {
    return config.messageTemplates.deleteConfirmation;
  }

  /**
   * Format participants list with truncation for large numbers
   * @param {Array} participants - List of participants
   * @returns {string} - Formatted participants list
   */
  formatParticipantsList(participants) {
    const maxDisplay = config.maxParticipantsDisplay;
    
    if (participants.length <= maxDisplay) {
      // Show all participants if within limit
      return participants
        .map(p => this.formatParticipant(p))
        .join(', ');
    } else {
      // Show first N participants and "and X more"
      const displayedParticipants = participants.slice(0, maxDisplay);
      const remainingCount = participants.length - maxDisplay;
      
      const displayedList = displayedParticipants
        .map(p => this.formatParticipant(p))
        .join(', ');
      
      return `${displayedList} and ${remainingCount} more`;
    }
  }

  /**
   * Format a single participant
   * @param {Object} participant - Participant object
   * @returns {string} - Formatted participant name
   */
  formatParticipant(participant) {
    let displayName;
    
    // If we have first name or last name (new format)
    if (participant.firstName || participant.lastName) {
      const fullName = `${participant.firstName} ${participant.lastName}`.trim();
      // If we also have a username, show both
      if (participant.username) {
        displayName = `${escapeHtml(fullName)} (@${escapeHtml(participant.username)})`;
      } else {
        displayName = escapeHtml(fullName);
      }
    } else {
      // Legacy format or username-only
      displayName = participant.username.includes(' ') ? escapeHtml(participant.username) : `@${escapeHtml(participant.username)}`;
    }
    
    return `<a href="tg://user?id=${participant.userId}">${displayName}</a>`;
  }
}
