import { config } from '../config.js';
import { escapeHtml } from '../utils/html-escape.js';
import { InlineKeyboard } from 'grammy';
import { DateParser } from '../utils/date-parser.js';
import { getCategoryLabel } from '../utils/category-utils.js';
import { t } from '../i18n/index.js';
import { formatSpeed } from '../utils/speed-utils.js';
import { getDerivedRouteLabel, getRideRoutes } from '../utils/route-links.js';

/**
 * Handles formatting messages for display
 */
export class MessageFormatter {
  /**
   * Telegram's message length limit
   */
  static MAX_MESSAGE_LENGTH = 4096;

  translate(key, params = {}, language = config.i18n.defaultLanguage) {
    return t(language, key, params, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
  }

  escapeForRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  renderRouteLinks(ride, language = config.i18n.defaultLanguage) {
    const routes = getRideRoutes(ride);
    if (routes.length === 0) {
      return '';
    }

    return routes.map(route => {
      const label = route.label || getDerivedRouteLabel(route.url, language);
      return `<a href="${escapeHtml(route.url)}">${escapeHtml(label)}</a>`;
    }).join(', ');
  }

  /**
   * Format a ride message with keyboard
   * @param {Object} ride - Ride object
   * @param {Object} participation - Participation object with joined, thinking, skipped arrays
   * @param {Object} options - Additional options for formatting
   * @param {boolean} options.isForCreator - Whether this message is for the ride creator
   * @returns {Object} - Object containing message text and keyboard
   */
  formatRideWithKeyboard(ride, participation, options = {}) {
    const language = options.lang || config.i18n.defaultLanguage;
    let message = this.formatRideMessage(ride, participation, options);
    
    // Truncate if message exceeds Telegram's limit
    if (message.length > MessageFormatter.MAX_MESSAGE_LENGTH) {
      const truncateMarker = this.translate('formatter.truncateMarker', {}, language);
      const maxLength = MessageFormatter.MAX_MESSAGE_LENGTH - truncateMarker.length;
      message = message.substring(0, maxLength) + truncateMarker;
    }
    
    const keyboard = this.getRideKeyboard(ride, language);
    
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
  getRideKeyboard(ride, language = config.i18n.defaultLanguage) {
    const keyboard = new InlineKeyboard();
    
    // Don't add participation buttons for cancelled rides
    if (!ride.cancelled) {
      // Show all three participation buttons
      keyboard.text(this.translate('buttons.join', {}, language), `join:${ride.id}`);
      keyboard.text(this.translate('buttons.thinking', {}, language), `thinking:${ride.id}`);
      keyboard.text(this.translate('buttons.pass', {}, language), `skip:${ride.id}`);
    }
    
    return keyboard;
  }

  /**
   * Format participants list with consistent display logic
   * @param {Array} participants - Array of participant objects
   * @param {string} emptyMessage - Message to show when no participants
   * @returns {string} - Formatted participants list
   */
  formatParticipantsWithLogic(
    participants,
    emptyMessage = this.translate('formatter.noParticipantsYet'),
    language = config.i18n.defaultLanguage
  ) {
    return participants.length > 0
      ? this.formatParticipantsList(participants, language)
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
    const language = options.lang || config.i18n.defaultLanguage;
    // Use DateParser for consistent timezone handling
    const formattedDateTime = DateParser.formatDateTime(ride.date, language);
    const datetime = `${formattedDateTime.date} ${this.translate('formatter.atWord', {}, language)} ${formattedDateTime.time}`;
    
    // Extract all participation categories
    const joinedParticipants = participation?.joined || [];
    const thinkingParticipants = participation?.thinking || [];
    const skippedParticipants = participation?.skipped || [];
    
    // Format participant counts and lists
    const participantCount = joinedParticipants.length;
    const thinkingCount = thinkingParticipants.length;
    const notInterestedCount = skippedParticipants.length;
    
    const participantsList = this.formatParticipantsWithLogic(
      joinedParticipants,
      this.translate('formatter.noOneJoinedYet', {}, language),
      language
    );
    
    // Conditional content - show empty content for hidden sections to avoid empty lines
    const thinkingContent = thinkingCount > 0 
      ? this.formatParticipantsList(thinkingParticipants, language)
      : '';
    
    const notInterestedContent = notInterestedCount > 0
      ? notInterestedCount.toString()
      : '';
    
    // Build ride details with proper grouping
    let rideDetails = '';
    
    // Group 1: Title is already handled in the template
    
    // Group 2: When and Category
    let group2 = `📅 ${this.translate('formatter.labels.when', {}, language)}: ${datetime}\n`;
    if (ride.category) {
      group2 += `🚵 ${this.translate('formatter.labels.category', {}, language)}: ${escapeHtml(getCategoryLabel(ride.category, language))}\n`;
    }
    rideDetails += group2;
    
    // Group 3: Organizer, Meeting point, Route
    let group3 = '';
    if (ride.organizer) {
      group3 += `👤 ${this.translate('formatter.labels.organizer', {}, language)}: ${escapeHtml(ride.organizer)}\n`;
    }
    if (ride.meetingPoint) {
      group3 += `📍 ${this.translate('formatter.labels.meetingPoint', {}, language)}: ${escapeHtml(ride.meetingPoint)}\n`;
    }
    const rideRouteLinks = this.renderRouteLinks(ride, language);
    if (rideRouteLinks) {
      group3 += `🗺️ ${this.translate('formatter.labels.route', {}, language)}: ${rideRouteLinks}\n`;
    }
    if (group3) {
      rideDetails += `\n${group3}`;
    }
    
    // Group 4: Distance, Duration, Speed
    let group4 = '';
    if (ride.distance) {
      group4 += `📏 ${this.translate('formatter.labels.distance', {}, language)}: ${ride.distance} ${this.translate('formatter.units.km', {}, language)}\n`;
    }
    if (ride.duration) {
      group4 += `⏱ ${this.translate('formatter.labels.duration', {}, language)}: ${this.formatDuration(ride.duration, language)}\n`;
    }
    if (ride.speedMin || ride.speedMax) {
      group4 += `⚡ ${this.translate('formatter.labels.speed', {}, language)}: ${this.formatSpeedRange(ride.speedMin, ride.speedMax, language)}\n`;
    }
    if (group4) {
      rideDetails += `\n${group4}`;
    }
    
    // Group 5: Additional info
    if (ride.additionalInfo) {
      rideDetails += `\nℹ️ ${this.translate('formatter.labels.additionalInfo', {}, language)}: ${escapeHtml(ride.additionalInfo)}\n`;
    }
    
    // Convert Markdown template to HTML
    let message = this.translate('templates.ride', {}, language)
      .replace(/\*([^*]+)\*/g, '<b>$1</b>') // Bold text
      .replace('{title}', escapeHtml(ride.title))
      .replace('{cancelledBadge}', ride.cancelled ? ` ${this.translate('templates.cancelled', {}, language)}` : '')
      .replace('{rideDetails}', rideDetails)
      .replace('{participantCount}', participantCount)
      .replace('{participants}', participantsList)
      .replace('{thinkingCount}', thinkingCount)
      .replace('{thinking}', thinkingContent)
      .replace('{notInterestedCount}', notInterestedContent)
      .replace('{joinedLabel}', this.translate('formatter.participation.joined', {}, language))
      .replace('{thinkingLabel}', this.translate('formatter.participation.thinking', {}, language))
      .replace('{notInterestedLabel}', this.translate('formatter.participation.notInterested', {}, language));
    
    // Add cancellation instructions if the ride is cancelled
    const cancelledInstructions = ride.cancelled ? `\n\n${this.translate('templates.cancelledMessage', {}, language)}` : '';
    message = message.replace('{cancelledInstructions}', cancelledInstructions);

    // Add share line for ride creator in private chat
    const shareLine = options.isForCreator
      ? `${this.translate('formatter.shareLine', { id: ride.id }, language)}\n\n`
      : '';
    message = message.replace('{shareLine}', shareLine);

    const groupChatLine = ride.groupId
      ? `${this.translate('formatter.groupChatLine', { id: ride.id }, language)}\n\n`
      : '';
    message = message.replace('{groupChatLine}', groupChatLine);

    message = message.replace('{id}', ride.id);
    
    // Remove lines that contain only emoji and empty content (e.g., "🤔 Thinking (0): ")
    const thinkingLabel = this.translate('formatter.participation.thinking', {}, language);
    const notInterestedLabel = this.translate('formatter.participation.notInterested', {}, language);
    message = message.replace(
      new RegExp(`🤔 ${this.escapeForRegex(thinkingLabel)} \\(0\\): \\n`, 'g'),
      ''
    );
    message = message.replace(
      new RegExp(`🙅 ${this.escapeForRegex(notInterestedLabel)}: \\n`, 'g'),
      ''
    );
    
    return message;
  }

  /**
   * Format a ride preview for display in the wizard live-preview message.
   * Shows all available ride fields without participation info or keyboard.
   * @param {Object} rideData - Ride-like object (from buildPreviewRideObject)
   * @param {string} language - Language code
   * @returns {string} - HTML-formatted preview string
   */
  formatRidePreview(rideData, language = config.i18n.defaultLanguage) {
    // Header: show title or placeholder
    if (!rideData.title) {
      return this.translate('wizard.preview.placeholder', {}, language);
    }
    let message = `🚲 <b>${escapeHtml(rideData.title)}</b>\n\n`;

    // Group 2: When and Category
    let group2 = '';
    if (rideData.date) {
      const fmt = DateParser.formatDateTime(rideData.date, language);
      group2 += `📅 ${this.translate('formatter.labels.when', {}, language)}: ${fmt.date} ${this.translate('formatter.atWord', {}, language)} ${fmt.time}\n`;
    }
    if (rideData.category) {
      group2 += `🚵 ${this.translate('formatter.labels.category', {}, language)}: ${escapeHtml(getCategoryLabel(rideData.category, language))}\n`;
    }
    message += group2;

    // Group 3: Organizer, Meeting point, Route
    let group3 = '';
    if (rideData.organizer) {
      group3 += `👤 ${this.translate('formatter.labels.organizer', {}, language)}: ${escapeHtml(rideData.organizer)}\n`;
    }
    if (rideData.meetingPoint) {
      group3 += `📍 ${this.translate('formatter.labels.meetingPoint', {}, language)}: ${escapeHtml(rideData.meetingPoint)}\n`;
    }
    const previewRouteLinks = this.renderRouteLinks(rideData, language);
    if (previewRouteLinks) {
      group3 += `🗺️ ${this.translate('formatter.labels.route', {}, language)}: ${previewRouteLinks}\n`;
    }
    if (group3) {
      message += `\n${group3}`;
    }

    // Group 4: Distance, Duration, Speed
    let group4 = '';
    if (rideData.distance) {
      group4 += `📏 ${this.translate('formatter.labels.distance', {}, language)}: ${rideData.distance} ${this.translate('formatter.units.km', {}, language)}\n`;
    }
    if (rideData.duration) {
      group4 += `⏱ ${this.translate('formatter.labels.duration', {}, language)}: ${this.formatDuration(rideData.duration, language)}\n`;
    }
    if (rideData.speedMin || rideData.speedMax) {
      group4 += `⚡ ${this.translate('formatter.labels.speed', {}, language)}: ${this.formatSpeedRange(rideData.speedMin, rideData.speedMax, language)}\n`;
    }
    if (group4) {
      message += `\n${group4}`;
    }

    // Group 5: Additional info
    if (rideData.additionalInfo) {
      message += `\nℹ️ ${this.translate('formatter.labels.additionalInfo', {}, language)}: ${escapeHtml(rideData.additionalInfo)}\n`;
    }

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
    const language = config.i18n.defaultLanguage;
    if (rides.length === 0) {
      return this.translate('formatter.noCreatedRides', {}, language);
    }
    
    let message = `🚲 <b>${this.translate('formatter.yourRidesTitle', {}, language)}</b>\n\n`;
    
    for (const ride of rides) {
      // Use DateParser for consistent timezone handling
      const formattedDateTime = DateParser.formatDateTime(ride.date, language);
      const datetime = `${formattedDateTime.date} ${this.translate('formatter.atWord', {}, language)} ${formattedDateTime.time}`;
      const status = ride.cancelled ? this.translate('templates.cancelled', {}, language) : '';
      
      message += `<b>${escapeHtml(ride.title)}</b> ${status}\n`;
      message += `📅 ${datetime}\n`;
      
      if (ride.meetingPoint) {
        message += `📍 ${escapeHtml(ride.meetingPoint)}\n`;
      }
      
      // Add chat information
      if (ride.messages && ride.messages.length > 0) {
        const chatCount = ride.messages.length;
        if (chatCount === 1) {
          message += `📢 ${this.translate('formatter.postedInSingleChat', { count: chatCount }, language)}\n`;
        } else {
          message += `📢 ${this.translate('formatter.postedInMultipleChats', { count: chatCount }, language)}\n`;
        }
      } else {
        message += `📢 ${this.translate('formatter.notPostedInAnyChats', {}, language)}\n`;
      }
      
      message += `🎫 #Ride #${ride.id}\n\n`;
    }
    
    if (totalPages > 1) {
      message += `\n${this.translate('formatter.pageLabel', { page, totalPages }, language)}`;
    }
    
    return message;
  }

  /**
   * Format a duration in minutes to a human-readable string
   * @param {number} minutes - Duration in minutes
   * @returns {string} - Formatted duration
   */
  formatDuration(minutes, language = config.i18n.defaultLanguage) {
    if (minutes < 60) {
      return `${minutes} ${this.translate('formatter.units.min', {}, language)}`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} ${this.translate('formatter.units.hour', {}, language)}`;
    }
    
    return `${hours} ${this.translate('formatter.units.hour', {}, language)} ${remainingMinutes} ${this.translate('formatter.units.min', {}, language)}`;
  }

  /**
   * Format a speed range
   * @param {number|null} min - Minimum speed
   * @param {number|null} max - Maximum speed
   * @returns {string} - Formatted speed range
   */
  formatSpeedRange(min, max, language = config.i18n.defaultLanguage) {
    return formatSpeed(min, max, language);
  }

  /**
   * Format a delete confirmation message
   * @returns {string} - Confirmation message
   */
  formatDeleteConfirmation() {
    return this.translate('templates.deleteConfirmation');
  }

  /**
   * Format participants list with truncation for large numbers
   * @param {Array} participants - List of participants
   * @returns {string} - Formatted participants list
   */
  formatParticipantsList(participants, language = config.i18n.defaultLanguage) {
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
      
      return this.translate('formatter.andMoreParticipants', {
        displayedList,
        count: remainingCount
      }, language);
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
