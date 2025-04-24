import { config } from '../config.js';
import { escapeHtml } from '../utils/html-escape.js';
import { InlineKeyboard } from 'grammy';
import { DateParser } from '../utils/date-parser.js';

/**
 * Handles formatting messages for display
 */
export class MessageFormatter {
  /**
   * Format a ride message with keyboard
   * @param {Object} ride - Ride object
   * @param {Array} participants - List of participants
   * @returns {Object} - Object containing message text and keyboard
   */
  formatRideWithKeyboard(ride, participants) {
    const message = this.formatRideMessage(ride, participants);
    const keyboard = this.getRideKeyboard(ride);
    
    return {
      message,
      keyboard,
      parseMode: 'HTML'
    };
  }

  /**
   * Get a standard ride keyboard with join/leave buttons
   * @param {Object} ride - Ride object
   * @returns {InlineKeyboard} - Keyboard markup
   */
  getRideKeyboard(ride) {
    const keyboard = new InlineKeyboard();
    
    // Don't add join/leave buttons for cancelled rides
    if (!ride.cancelled) {
      // Always show both buttons
      keyboard.text(config.buttons.join, `join:${ride.id}`);
      keyboard.text(config.buttons.leave, `leave:${ride.id}`);
    }
    
    return keyboard;
  }

  /**
   * Format a ride message
   * @param {Object} ride - Ride object
   * @param {Array} participants - List of participants
   * @returns {string} - Formatted message
   */
  formatRideMessage(ride, participants) {
    // Use DateParser for consistent timezone handling
    const formattedDateTime = DateParser.formatDateTime(ride.date);
    const datetime = `${formattedDateTime.date} at ${formattedDateTime.time}`;
    
    const participantCount = participants.length;
    const participantsList = participants.length > 0
      ? participants
          .map(p => {
            // Format the display name based on available information
            let displayName;
            
            // If we have first name or last name (new format)
            if (p.firstName || p.lastName) {
              const fullName = `${p.firstName} ${p.lastName}`.trim();
              // If we also have a username, show both
              if (p.username) {
                displayName = `${escapeHtml(fullName)} (@${escapeHtml(p.username)})`;
              } else {
                displayName = escapeHtml(fullName);
              }
            } else {
              // Legacy format or username-only
              displayName = p.username.includes(' ') ? escapeHtml(p.username) : `@${escapeHtml(p.username)}`;
            }
            
            return `• <a href="tg://user?id=${p.userId}">${displayName}</a>`;
          })
          .join('\n')
      : 'No participants yet';
    
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
      .replace('{participants}', participantsList);
    
    // Add cancellation instructions if the ride is cancelled
    const cancelledInstructions = ride.cancelled ? '\n\n' + config.messageTemplates.cancelledMessage : '';
    message = message.replace('{cancelledInstructions}', cancelledInstructions);

    message = message.replace('{id}', ride.id);
    
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
}
