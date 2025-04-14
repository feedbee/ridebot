import { RouteParser } from '../utils/route-parser.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';
import { normalizeCategory, DEFAULT_CATEGORY } from '../utils/category-utils.js';
import { parseDuration } from '../utils/duration-parser.js';

/**
 * Service class for managing rides and their messages
 */
export class RideService {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.messageFormatter = new MessageFormatter();
  }

  /**
   * Create a new ride
   * @param {Object} rideData - Ride data
   * @returns {Promise<Object>} - Created ride
   */
  async createRide(rideData) {
    return await this.storage.createRide(rideData);
  }

  /**
   * Update an existing ride
   * @param {string} rideId - Ride ID
   * @param {Object} updates - Updates to apply
   * @param {number} [userId] - User ID of the person making the update
   * @returns {Promise<Object>} - Updated ride
   */
  async updateRide(rideId, updates, userId = null) {
    // Only set updatedBy if userId is provided and there are other updates
    if (userId !== null && Object.keys(updates).length > 0) {
      updates.updatedBy = userId;
    }
    return await this.storage.updateRide(rideId, updates);
  }

  /**
   * Get a ride by ID
   * @param {string} rideId - Ride ID
   * @returns {Promise<Object>} - Ride object
   */
  async getRide(rideId) {
    return await this.storage.getRide(rideId);
  }

  /**
   * Delete a ride
   * @param {string} rideId - Ride ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRide(rideId) {
    return await this.storage.deleteRide(rideId);
  }

  /**
   * Get rides created by a user
   * @param {number} userId - User ID
   * @param {number} skip - Number of items to skip
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<Object>} - List of rides
   */
  async getRidesByCreator(userId, skip, limit) {
    return await this.storage.getRidesByCreator(userId, skip, limit);
  }

  /**
   * Add a participant to a ride
   * @param {string} rideId - Ride ID
   * @param {Object} participant - Participant data
   * @returns {Promise<Object>} - Success status and updated ride
   */
  async joinRide(rideId, participant) {
    const result = await this.storage.addParticipant(rideId, participant);
    return result;
  }

  /**
   * Remove a participant from a ride
   * @param {string} rideId - Ride ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Success status and updated ride
   */
  async leaveRide(rideId, userId) {
    const result = await this.storage.removeParticipant(rideId, userId);
    return result;
  }

  /**
   * Cancel a ride
   * @param {string} rideId - Ride ID
   * @param {number} [userId] - User ID of the person cancelling the ride
   * @returns {Promise<Object>} - Updated ride
   */
  async cancelRide(rideId, userId = null) {
    return await this.storage.updateRide(rideId, { cancelled: true, updatedBy: userId });
  }
  
  /**
   * Resume a cancelled ride
   * @param {string} rideId - Ride ID
   * @param {number} [userId] - User ID of the person resuming the ride
   * @returns {Promise<Object>} - Updated ride
   */
  async resumeRide(rideId, userId = null) {
    return await this.storage.updateRide(rideId, { cancelled: false, updatedBy: userId });
  }

  /**
   * Valid ride parameters and their descriptions
   * @type {Object.<string, string>}
   */
  static VALID_PARAMS = {
    'title': 'Title of the ride',
    'when': 'Date and time of the ride',
    'meet': 'Meeting point',
    'route': 'Route URL',
    'dist': 'Distance in kilometers',
    'duration': 'Duration in minutes',
    'speed': 'Speed range (e.g. 25-28)',
    'info': 'Additional information',
    'category': 'Ride category',
    'id': 'Ride ID (for commands that need it)'
  };

  /**
   * Parse ride parameters from text
   * @param {string} text - Text to parse
   * @returns {{params: Object, unknownParams: Array<string>}} - Parsed parameters and any unknown parameters
   */
  parseRideParams(text) {
    const lines = text.split('\n').slice(1); // Skip command line
    const params = {};
    const unknownParams = [];

    for (const line of lines) {
      const match = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
      if (match) {
        const [_, key, value] = match;
        const normalizedKey = key.trim().toLowerCase();
        
        if (RideService.VALID_PARAMS.hasOwnProperty(normalizedKey)) {
          params[normalizedKey] = value.trim();
        } else {
          unknownParams.push(key.trim());
        }
      } else {
        unknownParams.push(line.trim());
      }
    }

    return { params, unknownParams };
  }

  /**
   * Create a ride from parameters
   * @param {Object} params - Ride parameters
   * @param {number} chatId - Chat ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Created ride and any errors
   */
  async createRideFromParams(params, chatId, userId) {
    if (!params.title || !params.when) {
      return { 
        ride: null, 
        error: 'Please provide at least title and date/time.'
      };
    }

    try {
      const result = parseDateTimeInput(params.when);
      if (!result.date) {
        return { ride: null, error: result.error };
      }
      
      // Create ride data object
      const rideData = {
        title: params.title,
        category: params.category ? normalizeCategory(params.category) : DEFAULT_CATEGORY,
        date: result.date,
        messages: [], // Initialize with empty array instead of null messageId
        createdBy: userId
      };

      if (params.meet) {
        rideData.meetingPoint = params.meet;
      }

      if (params.route) {
        const routeInfo = await RouteParser.processRouteInfo(params.route);
        if (routeInfo.error) {
          return { ride: null, error: routeInfo.error };
        }
        
        rideData.routeLink = routeInfo.routeLink;
        
        // Only use parsed details if not explicitly provided
        if (routeInfo.distance && !params.dist) {
          rideData.distance = routeInfo.distance;
        }
        
        if (routeInfo.duration && !params.duration) {
          rideData.duration = routeInfo.duration;
        }
      }

      if (params.dist) {
        rideData.distance = parseFloat(params.dist);
      }

      if (params.duration) {
        const result = parseDuration(params.duration);
        if (result.error) {
          return { ride: null, error: result.error };
        }
        rideData.duration = result.duration;
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) rideData.speedMin = min;
        if (!isNaN(max)) rideData.speedMax = max;
      }

      if (params.info !== undefined) {
        rideData.additionalInfo = params.info;
      }

      const ride = await this.storage.createRide(rideData);
      return { ride, error: null };
    } catch (error) {
      console.error('Error creating ride:', error);
      return { ride: null, error: 'An error occurred while creating the ride.' };
    }
  }

  /**
   * Update a ride from parameters
   * @param {string} rideId - Ride ID
   * @param {Object} params - Update parameters
   * @param {number} [userId] - User ID of the person updating the ride
   * @returns {Promise<Object>} - Updated ride and any errors
   */
  async updateRideFromParams(rideId, params, userId = null) {
    try {
      const updates = {};
      
      if (params.title) {
        updates.title = params.title;
      }
      
      if (params.category !== undefined) {
        // Use dash ('-') to remove the field value and set to default
        if (params.category === '-') {
          updates.category = DEFAULT_CATEGORY; // Reset to default
        } else {
          updates.category = normalizeCategory(params.category);
        }
      }
      
      if (params.when) {
        const result = parseDateTimeInput(params.when);
        if (!result.date) {
          return { ride: null, error: result.error };
        }
        updates.date = result.date;
      }
      
      if (params.meet !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.meet === '-') {
          updates.meetingPoint = '';
        } else {
          updates.meetingPoint = params.meet;
        }
      }
      
      if (params.route !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.route === '-') {
          updates.routeLink = '';
        } else {
          const routeInfo = await RouteParser.processRouteInfo(params.route);
          if (routeInfo.error) {
            return { ride: null, error: routeInfo.error };
          }
          
          updates.routeLink = routeInfo.routeLink;
          
          // Use parsed details if available and not explicitly provided
          if (routeInfo.distance && !params.dist) {
            updates.distance = routeInfo.distance;
          }
          
          if (routeInfo.duration && !params.duration) {
            updates.duration = routeInfo.duration;
          }
        }
      }
      
      if (params.dist !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.dist === '-') {
          updates.distance = null;
        } else {
          updates.distance = parseFloat(params.dist);
        }
      }
      
      if (params.duration !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.duration === '-') {
          updates.duration = null;
        } else {
          const result = parseDuration(params.duration);
          if (result.error) {
            return { ride: null, error: result.error };
          }
          updates.duration = result.duration;
        }
      }
      
      if (params.speed !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.speed === '-') {
          updates.speedMin = null;
          updates.speedMax = null;
        } else {
          const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
          if (!isNaN(min)) updates.speedMin = min;
          if (!isNaN(max)) updates.speedMax = max;
        }
      }
      
      if (params.info !== undefined) {
        // Use dash ('-') to remove the field value
        if (params.info === '-') {
          updates.additionalInfo = '';
        } else {
          updates.additionalInfo = params.info;
        }
      }
      
      // Only set updatedBy if there are other updates
      if (Object.keys(updates).length > 0 && userId !== null) {
        updates.updatedBy = userId;
      }
      
      if (Object.keys(updates).length === 0) {
        // No updates to make, return the current ride
        const ride = await this.storage.getRide(rideId);
        return { ride, error: null };
      }
      
      const ride = await this.storage.updateRide(rideId, updates);
      return { ride, error: null };
    } catch (error) {
      console.error('Error updating ride:', error);
      return { ride: null, error: 'An error occurred while updating the ride.' };
    }
  }

  /**
   * Extract ride ID from message text or reply
   * @param {Object} message - Message object
   * @returns {Object} - Ride ID or error
   */
  extractRideId(message) {
    // First check if ID is provided right after the command on the same line
    // Extract just the first line to ensure we don't match across newlines
    const firstLine = message.text.split('\n')[0];
    // Updated regex to match IDs with optional leading # symbol
    const commandMatch = firstLine.match(/^\/(\w+)(\s+#?(\w+))?/i);
    const commandName = commandMatch && commandMatch[1] ? commandMatch[1] : 'command';
    if (commandMatch && commandMatch[3]) {
      return { rideId: commandMatch[3], error: null };
    }
    
    // Then check if ID is provided in parameters
    const { params: parsedParams } = this.parseRideParams(message.text);
    if (parsedParams && parsedParams.id) {
      // Remove any leading # from the ID parameter
      const cleanId = parsedParams.id.replace(/^#/, '');
      return { rideId: cleanId, error: null };
    }
    
    // Then check replied message
    if (message.reply_to_message?.text) {
      const originalMessage = message.reply_to_message.text;
      const rideIdMatch = originalMessage.match(/🎫\s*#Ride\s*#(\w+)/i);
      
      if (!rideIdMatch) {
        return { 
          rideId: null, 
          error: 'Could not find ride ID in the message. Please make sure you are replying to a ride message or provide a ride ID.'
        };
      }
      // No need to strip # here as the regex already handles it
      return { rideId: rideIdMatch[1], error: null };
    }
    
    return { 
      rideId: null, 
      error: `Please provide a ride ID after the command (e.g., /${commandName} rideID) or reply to a ride message.`
    };
  }

  /**
   * Create and store a ride message in a chat
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {number} messageThreadId - Message thread ID
   * @returns {Promise<Object>} - Object containing the sent message and updated ride
   */
  async createRideMessage(ride, ctx, messageThreadId) {
    try {
      // Message thread id
      const threadId = messageThreadId || ctx.message?.message_thread_id;

      // Get participants from the ride object and format the message
      const participants = ride.participants || [];
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants);
      
      // Prepare reply options
      const replyOptions = {
        parse_mode: parseMode,
        reply_markup: keyboard
      };
      
      // If the message is in a topic, include the message_thread_id
      if (threadId) {
        replyOptions.message_thread_id = threadId;
      }
      
      // Send the message
      const sentMessage = await ctx.reply(message, replyOptions);

      // Prepare the message data for storage
      const messageData = {
        chatId: ctx.chat.id,
        messageId: sentMessage.message_id
      };
      
      // Include message thread ID if present
      if (threadId) {
        messageData.messageThreadId = threadId;
      }

      // Update the ride with the message info in the messages array
      const updatedRide = await this.updateRide(ride.id, {
        messages: [...(ride.messages || []), messageData]
      });

      return {
        sentMessage,
        updatedRide
      };
    } catch (error) {
      console.error('Error creating ride message:', error);
      throw error;
    }
  }

  /**
   * Update all messages for a ride across all chats
   * @param {Object} ride - Ride object
   * @param {import('grammy').Context} ctx - Grammy context
   * @returns {Promise<{success: boolean, updatedCount: number, removedCount: number}>} - Result of the update operation
   */
  async updateRideMessages(ride, ctx) {
    // If no messages to update, return early
    if (!ride.messages || ride.messages.length === 0) {
      return { success: true, updatedCount: 0, removedCount: 0 };
    }

    try {
      const participants = ride.participants || [];
      const { message, keyboard, parseMode } = this.messageFormatter.formatRideWithKeyboard(ride, participants);
      
      let updatedCount = 0;
      let removedCount = 0;
      const messagesToRemove = [];
      
      // Update all messages for this ride
      for (const messageInfo of ride.messages) {
        try {
          // Prepare options for editing the message
          const editOptions = {
            parse_mode: parseMode,
            reply_markup: keyboard
          };
          
          // Include message_thread_id if it exists in the message info
          if (messageInfo.messageThreadId) {
            editOptions.message_thread_id = messageInfo.messageThreadId;
          }
          
          await ctx.api.editMessageText(
            messageInfo.chatId,
            messageInfo.messageId,
            message,
            editOptions
          );
          updatedCount++;
        } catch (messageError) {
          console.warn(`Error updating message in chat ${messageInfo.chatId}:`, messageError);
          
          // Check if the message is no longer available (deleted or bot kicked)
          if (messageError.description && (
              messageError.description.includes('message to edit not found') ||
              messageError.description.includes('bot was blocked by the user') ||
              messageError.description.includes('chat not found') ||
              messageError.description.includes('user is deactivated') ||
              messageError.description.includes('not enough rights')
          )) {
            // Mark this message for removal from the tracking array
            messagesToRemove.push(messageInfo);
            removedCount++;
          }
        }
      }
      
      // Remove messages that couldn't be updated from the tracking array
      if (messagesToRemove.length > 0) {
        // Filter out messages that should be removed
        const updatedMessages = ride.messages.filter(msg => 
          !messagesToRemove.some(toRemove => 
            toRemove.chatId === msg.chatId && 
            toRemove.messageId === msg.messageId && 
            toRemove.messageThreadId === msg.messageThreadId
          )
        );
        
        // Update the ride with the filtered messages array
        await this.updateRide(ride.id, { messages: updatedMessages });
      }
      
      return { 
        success: true, 
        updatedCount, 
        removedCount 
      };
    } catch (error) {
      console.error('Error updating ride messages:', error);
      return { 
        success: false, 
        updatedCount: 0, 
        removedCount: 0, 
        error: error.message || 'Unknown error' 
      };
    }
  }
}
