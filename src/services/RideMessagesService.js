import { RideParamsHelper } from '../utils/RideParamsHelper.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';

/**
 * Service class for handling ride message operations
 */
export class RideMessagesService {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   */
  constructor(rideService) {
    this.rideService = rideService;
    this.messageFormatter = new MessageFormatter();
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
    const { params: parsedParams } = RideParamsHelper.parseRideParams(message.text);
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
      const updatedRide = await this.rideService.updateRide(ride.id, {
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
        await this.rideService.updateRide(ride.id, { messages: updatedMessages });
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
