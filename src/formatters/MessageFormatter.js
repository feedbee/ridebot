import { config } from '../config.js';
import { escapeHtml } from '../utils/html-escape.js';
import { InlineKeyboard } from 'grammy';

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
    const dateOptions = config.dateFormat.date;
    const timeOptions = config.dateFormat.time;
    const locale = config.dateFormat.locale;
    
    const date = ride.date.toLocaleDateString(locale, dateOptions);
    const time = ride.date.toLocaleTimeString(locale, timeOptions);
    
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
            
            return `<a href="tg://user?id=${p.userId}">${displayName}</a>`;
          })
          .join('\n')
      : 'No participants yet';
    
    // Convert Markdown template to HTML
    let message = config.messageTemplates.ride
      .replace(/\*([^*]+)\*/g, '<b>$1</b>') // Bold text
      .replace('{title}', escapeHtml(ride.title))
      .replace('{cancelledBadge}', ride.cancelled ? ` ${config.messageTemplates.cancelled}` : '')
      .replace('{date}', date)
      .replace('{time}', time)
      .replace('{participantCount}', participantCount)
      .replace('{participants}', participantsList);
    
    // Optional fields
    const meetingInfo = ride.meetingPoint
      ? `📍 Meeting point: ${escapeHtml(ride.meetingPoint)}\n`
      : '';
    message = message.replace('{meetingInfo}', meetingInfo);
    
    const routeInfo = ride.routeLink
      ? `🔄 Route: <a href="${ride.routeLink}">Link</a>\n`
      : '';
    message = message.replace('{routeInfo}', routeInfo);
    
    const distanceInfo = ride.distance
      ? `📏 Distance: ${ride.distance} km\n`
      : '';
    message = message.replace('{distanceInfo}', distanceInfo);
    
    const durationInfo = ride.duration
      ? `⏱ Duration: ${this.formatDuration(ride.duration)}\n`
      : '';
    message = message.replace('{durationInfo}', durationInfo);
    
    const speedInfo = (ride.speedMin || ride.speedMax)
      ? `⚡ Speed: ${this.formatSpeedRange(ride.speedMin, ride.speedMax)}\n`
      : '';
    message = message.replace('{speedInfo}', speedInfo);
    
    // Always just show the ride ID, no additional instructions
    const joinInstructions = ride.cancelled
      ? config.messageTemplates.cancelledInstructions.replace('{id}', ride.id).replace(/\*([^*]+)\*/g, '<b>$1</b>')
      : `🎫 Ride #${ride.id}`;
    message = message.replace('{joinInstructions}', joinInstructions);
    
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
    
    const dateOptions = config.dateFormat.date;
    const timeOptions = config.dateFormat.time;
    const locale = config.dateFormat.locale;
    
    let message = '🚲 <b>Your Rides</b>\n\n';
    
    for (const ride of rides) {
      const date = ride.date.toLocaleDateString(locale, dateOptions);
      const time = ride.date.toLocaleTimeString(locale, timeOptions);
      const status = ride.cancelled ? '❌ CANCELLED' : '';
      
      message += `<b>${escapeHtml(ride.title)}</b> ${status}\n`;
      message += `📅 ${date} ⏰ ${time}\n`;
      
      if (ride.meetingPoint) {
        message += `📍 ${escapeHtml(ride.meetingPoint)}\n`;
      }
      
      message += `🎫 Ride #${ride.id}\n\n`;
    }
    
    if (totalPages > 1) {
      message += `\nPage ${page + 1}/${totalPages}`;
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
