import { RideParamsHelper } from '../utils/RideParamsHelper.js';

/**
 * Service class for handling ride message operations
 */
export class RideMessagesService {
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
} 
