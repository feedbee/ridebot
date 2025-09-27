import { RideMessagesService } from '../../services/RideMessagesService.js';

describe('RideMessagesService', () => {
  let rideMessagesService;

  beforeEach(() => {
    rideMessagesService = new RideMessagesService();
  });

  describe('extractRideId', () => {
    // Test for extracting ride ID from command line with optional # symbol
    it('should extract ride ID from command line with optional # symbol', () => {
      // Test without #
      const message1 = {
        text: '/updateride abc123'
      };
      
      const result1 = rideMessagesService.extractRideId(message1);
      expect(result1.rideId).toBe('abc123');
      expect(result1.error).toBeNull();
      
      // Test with #
      const message2 = {
        text: '/updateride #abc123'
      };
      
      const result2 = rideMessagesService.extractRideId(message2);
      expect(result2.rideId).toBe('abc123');
      expect(result2.error).toBeNull();
    });
    
    it('should extract ride ID from command line with bot username', () => {
      // Test with bot username and without #
      const message1 = {
        text: '/updateride@MyRideBot abc123'
      };
      
      const result1 = rideMessagesService.extractRideId(message1);
      expect(result1.rideId).toBe('abc123');
      expect(result1.error).toBeNull();
      
      // Test with bot username and with #
      const message2 = {
        text: '/updateride@MyRideBot #abc123'
      };
      
      const result2 = rideMessagesService.extractRideId(message2);
      expect(result2.rideId).toBe('abc123');
      expect(result2.error).toBeNull();
    });
    
    it('should handle various command formats', () => {
      const message = {
        text: '/updateride abc123'
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    it('should handle various command formats', () => {
      // Test with plain ID
      const message1 = {
        text: '/updateride abc123'
      };
      const result1 = rideMessagesService.extractRideId(message1);
      expect(result1.rideId).toBe('abc123');
      expect(result1.error).toBeNull();
      
      // Test with # prefix
      const message2 = {
        text: '/updateride #abc123'
      };
      const result2 = rideMessagesService.extractRideId(message2);
      expect(result2.rideId).toBe('abc123');
      expect(result2.error).toBeNull();
      
      // Test with different commands
      const commands = ['cancelride', 'deleteride', 'dupride', 'postride'];
      
      for (const cmd of commands) {
        // Without #
        const msgWithoutHash = {
          text: `/${cmd} xyz789`
        };
        const resultWithoutHash = rideMessagesService.extractRideId(msgWithoutHash);
        expect(resultWithoutHash.rideId).toBe('xyz789');
        expect(resultWithoutHash.error).toBeNull();
        
        // With #
        const msgWithHash = {
          text: `/${cmd} #xyz789`
        };
        const resultWithHash = rideMessagesService.extractRideId(msgWithHash);
        expect(resultWithHash.rideId).toBe('xyz789');
        expect(resultWithHash.error).toBeNull();
      }
    });
    
    // Test for extracting ride ID from parameters
    it('should extract ride ID from parameters', () => {
      const message = {
        text: '/updateride\nid: abc123'
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    // Test for extracting ride ID from parameters with leading # symbol
    it('should extract ride ID from parameters with leading # symbol', () => {
      const message = {
        text: '/updateride\nid: #abc123'
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    it('should accept both #id and id formats in parameters', () => {
      // Test with different commands and both formats
      const commands = ['updateride', 'cancelride', 'deleteride', 'dupride', 'postride'];
      
      for (const cmd of commands) {
        // Without #
        const msgWithoutHash = {
          text: `/${cmd}\nid: xyz789`
        };
        const resultWithoutHash = rideMessagesService.extractRideId(msgWithoutHash);
        expect(resultWithoutHash.rideId).toBe('xyz789');
        expect(resultWithoutHash.error).toBeNull();
        
        // With #
        const msgWithHash = {
          text: `/${cmd}\nid: #xyz789`
        };
        const resultWithHash = rideMessagesService.extractRideId(msgWithHash);
        expect(resultWithHash.rideId).toBe('xyz789');
        expect(resultWithHash.error).toBeNull();
      }
    });
    
    // Test for extracting ride ID from replied message
    it('should extract ride ID from replied message', () => {
      const message = {
        text: '/updateride',
        reply_to_message: {
          text: '🎫 #Ride #abc123\nSome other content'
        }
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });
    
    // Test for returning error when no ID is found
    it('should return error when no ID is found', () => {
      const message = {
        text: '/updateride'
        // No reply and no ID parameter
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBeNull();
      expect(result.error).toBe('Please provide a ride ID after the command (e.g., /updateride rideID) or reply to a ride message.');
    });
    
    // Test for returning error when replied message has no ride ID
    it('should return error when replied message has no ride ID', () => {
      const message = {
        text: '/updateride',
        reply_to_message: {
          text: 'This is not a ride message'
        }
      };
      
      const result = rideMessagesService.extractRideId(message);
      
      expect(result.rideId).toBeNull();
      expect(result.error).toContain('Could not find ride ID in the message');
    });
  });
}); 
