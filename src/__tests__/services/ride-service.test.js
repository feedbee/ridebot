/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideService } from '../../services/RideService.js';
import { MemoryStorage } from '../../storage/memory.js';

// Import the module first, then mock its methods
import { RouteParser } from '../../utils/route-parser.js';

// Setup mocks for RouteParser methods
RouteParser.isValidRouteUrl = jest.fn();
RouteParser.isKnownProvider = jest.fn();
RouteParser.parseRoute = jest.fn();

describe('RideService', () => {
  let rideService;
  let storage;
  
  const testRide = {
    title: 'Test Ride',
    date: new Date('2024-03-15T15:00:00Z'),
    messages: [{ chatId: 123456, messageId: 789123 }],
    createdBy: 789,
    meetingPoint: 'Test Location',
    routeLink: 'https://example.com/route',
    distance: 50,
    duration: 180,
    speedMin: 25,
    speedMax: 28
  };

  const testParticipant = {
    userId: 101,
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User'
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a fresh storage instance for each test
    storage = new MemoryStorage();
    rideService = new RideService(storage);
  });

  describe('Basic CRUD Operations', () => {
    it('should create a ride', async () => {
      const ride = await rideService.createRide(testRide);
      
      expect(ride).toHaveProperty('id');
      expect(ride.title).toBe(testRide.title);
      expect(ride.date).toEqual(testRide.date);
      expect(ride.messages).toEqual(testRide.messages);
    });

    it('should get a ride by ID', async () => {
      const createdRide = await rideService.createRide(testRide);
      const retrievedRide = await rideService.getRide(createdRide.id);
      
      expect(retrievedRide).toEqual(createdRide);
    });

    it('should update a ride', async () => {
      const createdRide = await rideService.createRide(testRide);
      const updates = { 
        title: 'Updated Ride Title',
        meetingPoint: 'New Meeting Point'
      };
      
      const updatedRide = await rideService.updateRide(createdRide.id, updates);
      
      expect(updatedRide.title).toBe(updates.title);
      expect(updatedRide.meetingPoint).toBe(updates.meetingPoint);
      // Other properties should remain unchanged
      expect(updatedRide.date).toEqual(createdRide.date);
      expect(updatedRide.distance).toBe(createdRide.distance);
    });

    it('should delete a ride', async () => {
      const createdRide = await rideService.createRide(testRide);
      const deleteResult = await rideService.deleteRide(createdRide.id);
      const retrievedRide = await rideService.getRide(createdRide.id);
      
      expect(deleteResult).toBe(true);
      expect(retrievedRide).toBeNull();
    });

    it('should cancel a ride', async () => {
      const createdRide = await rideService.createRide(testRide);
      const cancelledRide = await rideService.cancelRide(createdRide.id);
      
      expect(cancelledRide.cancelled).toBe(true);
    });
  });

  describe('Message Tracking', () => {
    it('should preserve the messages array when updating a ride', async () => {
      // Create a ride with messages
      const rideData = {
        title: 'Test Ride',
        date: new Date(),
        createdBy: 123,

        messages: [{ chatId: 456, messageId: 789 }, { chatId: 789, messageId: 123 }]
      };
      
      const createdRide = await rideService.createRide(rideData);
      expect(createdRide.messages).toHaveLength(2);
      
      // Update the ride
      const updates = { title: 'Updated Test Ride' };
      const updatedRide = await rideService.updateRide(createdRide.id, updates);
      
      // Verify messages array is preserved
      expect(updatedRide.messages).toHaveLength(2);
      expect(updatedRide.messages).toEqual(rideData.messages);
    });
    
    it('should preserve the messages array when updating a ride from parameters', async () => {
      // Create a ride with messages
      const rideData = {
        title: 'Test Ride',
        date: new Date(),
        createdBy: 123,

        messages: [{ chatId: 456, messageId: 789 }, { chatId: 789, messageId: 123 }]
      };
      
      const createdRide = await rideService.createRide(rideData);
      expect(createdRide.messages).toHaveLength(2);
      
      // Update the ride using parameters
      const params = { title: 'Updated Test Ride' };
      const result = await rideService.updateRideFromParams(createdRide.id, params);
      
      // Verify messages array is preserved
      expect(result.error).toBeNull();
      expect(result.ride.messages).toHaveLength(2);
      expect(result.ride.messages).toEqual(rideData.messages);
    });
  });

  describe('Participant Management', () => {
    it('should add a participant to a ride', async () => {
      const ride = await rideService.createRide(testRide);
      const result = await rideService.addParticipant(ride.id, testParticipant);
      const participants = await rideService.getParticipants(ride.id);
      
      expect(result).toBe(true);
      expect(participants).toHaveLength(1);
      expect(participants[0].userId).toBe(testParticipant.userId);
      expect(participants[0].username).toBe(testParticipant.username);
    });

    it('should not add the same participant twice', async () => {
      const ride = await rideService.createRide(testRide);
      await rideService.addParticipant(ride.id, testParticipant);
      const secondResult = await rideService.addParticipant(ride.id, testParticipant);
      const participants = await rideService.getParticipants(ride.id);
      
      expect(secondResult).toBe(false);
      expect(participants).toHaveLength(1);
    });

    it('should remove a participant from a ride', async () => {
      const ride = await rideService.createRide(testRide);
      await rideService.addParticipant(ride.id, testParticipant);
      
      const removeResult = await rideService.removeParticipant(ride.id, testParticipant.userId);
      const participants = await rideService.getParticipants(ride.id);
      
      expect(removeResult).toBe(true);
      expect(participants).toHaveLength(0);
    });

    it('should return false when removing a non-existent participant', async () => {
      const ride = await rideService.createRide(testRide);
      const removeResult = await rideService.removeParticipant(ride.id, 999);
      
      expect(removeResult).toBe(false);
    });
  });

  describe('Ride Listing', () => {
    it('should get rides created by a user', async () => {
      // Create rides for different users
      await rideService.createRide(testRide); // User 789
      await rideService.createRide({
        ...testRide,
        title: 'Another Ride',
        createdBy: 456
      }); // User 456
      
      const result = await rideService.getRidesByCreator(789, 0, 10);
      
      expect(result.total).toBe(1);
      expect(result.rides).toHaveLength(1);
      expect(result.rides[0].title).toBe('Test Ride');
    });

    it('should respect skip and limit parameters', async () => {
      // Create multiple rides for the same user
      for (let i = 0; i < 5; i++) {
        await rideService.createRide({
          ...testRide,
          title: `Ride ${i}`,
          date: new Date(`2024-03-${15 + i}T15:00:00Z`)
        });
      }
      
      const result = await rideService.getRidesByCreator(789, 2, 2);
      
      expect(result.total).toBe(5);
      expect(result.rides).toHaveLength(2);
    });
  });

  describe('Parameter Parsing', () => {
    it('should parse ride parameters from text', () => {
      const text = `/newride
title: Sunday Morning Ride
when: Sunday 9am
meet: Coffee Shop
route: https://example.com/route
speed: 25-28`;
      
      const params = rideService.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Sunday Morning Ride',
        when: 'Sunday 9am',
        meet: 'Coffee Shop',
        route: 'https://example.com/route',
        speed: '25-28'
      });
    });

    it('should handle malformed parameter lines', () => {
      const text = `/newride
title: Sunday Morning Ride
when: Sunday 9am
This line has no parameter
meet: Coffee Shop`;
      
      const params = rideService.parseRideParams(text);
      
      expect(params).toEqual({
        title: 'Sunday Morning Ride',
        when: 'Sunday 9am',
        meet: 'Coffee Shop'
      });
    });
  });

  describe('Route Processing', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      jest.clearAllMocks();
    });
    
    it('should process valid route URLs', async () => {
      // Set up mocks for this test
      RouteParser.isValidRouteUrl.mockReturnValue(true);
      RouteParser.isKnownProvider.mockReturnValue(true);
      RouteParser.parseRoute.mockResolvedValue({ distance: 50, duration: 180 });
      
      const result = await rideService.processRouteInfo('https://example.com/route');
      
      expect(result).toEqual({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      expect(RouteParser.isValidRouteUrl).toHaveBeenCalledWith('https://example.com/route');
      expect(RouteParser.isKnownProvider).toHaveBeenCalledWith('https://example.com/route');
      expect(RouteParser.parseRoute).toHaveBeenCalledWith('https://example.com/route');
    });

    it('should handle invalid URL formats', async () => {
      // Set up mocks for this test
      RouteParser.isValidRouteUrl.mockReturnValue(false);
      
      const result = await rideService.processRouteInfo('not-a-url');
      
      expect(result).toEqual({
        error: 'Invalid URL format. Please provide a valid URL.'
      });
      expect(RouteParser.isValidRouteUrl).toHaveBeenCalledWith('not-a-url');
      expect(RouteParser.isKnownProvider).not.toHaveBeenCalled();
      expect(RouteParser.parseRoute).not.toHaveBeenCalled();
    });

    it('should handle unknown providers', async () => {
      // Set up mocks for this test
      RouteParser.isValidRouteUrl.mockReturnValue(true);
      RouteParser.isKnownProvider.mockReturnValue(false);
      
      const result = await rideService.processRouteInfo('https://unknown.com/route');
      
      expect(result).toEqual({
        routeLink: 'https://unknown.com/route'
      });
      expect(RouteParser.isValidRouteUrl).toHaveBeenCalledWith('https://unknown.com/route');
      expect(RouteParser.isKnownProvider).toHaveBeenCalledWith('https://unknown.com/route');
      expect(RouteParser.parseRoute).not.toHaveBeenCalled();
    });

    it('should handle partial route parsing results', async () => {
      // Set up mocks for this test
      RouteParser.isValidRouteUrl.mockReturnValue(true);
      RouteParser.isKnownProvider.mockReturnValue(true);
      RouteParser.parseRoute.mockResolvedValue({ distance: 50 }); // Only distance, no duration
      
      const result = await rideService.processRouteInfo('https://example.com/route');
      
      expect(result).toEqual({
        routeLink: 'https://example.com/route',
        distance: 50
      });
      expect(RouteParser.isValidRouteUrl).toHaveBeenCalledWith('https://example.com/route');
      expect(RouteParser.isKnownProvider).toHaveBeenCalledWith('https://example.com/route');
      expect(RouteParser.parseRoute).toHaveBeenCalledWith('https://example.com/route');
    });
    
    it('should handle null result from route parser', async () => {
      // Set up mocks for this test
      RouteParser.isValidRouteUrl.mockReturnValue(true);
      RouteParser.isKnownProvider.mockReturnValue(true);
      RouteParser.parseRoute.mockResolvedValue(null);
      
      const result = await rideService.processRouteInfo('https://example.com/route');
      
      expect(result).toEqual({
        routeLink: 'https://example.com/route'
      });
      expect(RouteParser.isValidRouteUrl).toHaveBeenCalledWith('https://example.com/route');
      expect(RouteParser.isKnownProvider).toHaveBeenCalledWith('https://example.com/route');
      expect(RouteParser.parseRoute).toHaveBeenCalledWith('https://example.com/route');
    });
  });

  describe('Ride Creation from Parameters', () => {
    it('should create a ride from valid parameters', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        meet: 'Coffee Shop',
        route: 'https://example.com/route',
        speed: '25-28'
      };
      
      const result = await rideService.createRideFromParams(params, 123456, 789);
      
      expect(result.error).toBeNull();
      expect(result.ride).toHaveProperty('id');
      expect(result.ride.title).toBe(params.title);
      expect(result.ride.meetingPoint).toBe(params.meet);
      expect(result.ride.routeLink).toBe(params.route);
      expect(result.ride.speedMin).toBe(25);
      expect(result.ride.speedMax).toBe(28);
    });

    it('should require title and date parameters', async () => {
      const params = {
        title: 'Sunday Morning Ride'
        // Missing 'when' parameter
      };
      
      const result = await rideService.createRideFromParams(params, 123456, 789);
      
      expect(result.error).toBe('Please provide at least title and date/time.');
      expect(result.ride).toBeNull();
    });

    it('should handle invalid date formats', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'not a valid date'
      };
      
      // Mock the date parser to return an error
      jest.spyOn(rideService, 'parseDateTimeInput').mockReturnValueOnce({
        date: null,
        error: 'Invalid date format'
      });
      
      const result = await rideService.createRideFromParams(params, 123456, 789);
      
      expect(result.error).toBe('Invalid date format');
      expect(result.ride).toBeNull();
    });

    it('should use route parser data when available', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        route: 'https://example.com/route'
      };
      
      // Mock date parser
      jest.spyOn(rideService, 'parseDateTimeInput').mockReturnValueOnce({
        date: new Date('2024-03-15T09:00:00Z'),
        error: null
      });
      
      // Mock route parser
      jest.spyOn(rideService, 'processRouteInfo').mockResolvedValueOnce({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      
      const result = await rideService.createRideFromParams(params, 123456, 789);
      
      expect(result.error).toBeNull();
      expect(result.ride.distance).toBe(50);
      expect(result.ride.duration).toBe(180);
    });

    it('should prioritize explicit parameters over route parser data', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        route: 'https://example.com/route',
        dist: '75',
        time: '210'
      };
      
      // Mock date parser
      jest.spyOn(rideService, 'parseDateTimeInput').mockReturnValueOnce({
        date: new Date('2024-03-15T09:00:00Z'),
        error: null
      });
      
      // Mock route parser
      jest.spyOn(rideService, 'processRouteInfo').mockResolvedValueOnce({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      
      const result = await rideService.createRideFromParams(params, 123456, 789);
      
      expect(result.error).toBeNull();
      expect(result.ride.distance).toBe(75); // From params, not from route parser
      expect(result.ride.duration).toBe(210); // From params, not from route parser
    });
  });

  describe('Ride Updates from Parameters', () => {
    it('should update a ride from valid parameters', async () => {
      // Create a ride first
      const ride = await rideService.createRide(testRide);
      
      const params = {
        title: 'Updated Ride Title',
        when: 'tomorrow 10am',
        meet: 'New Meeting Point'
      };
      
      // Mock date parser
      jest.spyOn(rideService, 'parseDateTimeInput').mockReturnValueOnce({
        date: new Date('2024-03-15T10:00:00Z'),
        error: null
      });
      
      const result = await rideService.updateRideFromParams(ride.id, params);
      
      expect(result.error).toBeNull();
      expect(result.ride.title).toBe(params.title);
      expect(result.ride.meetingPoint).toBe(params.meet);
      // Original fields should be preserved if not updated
      expect(result.ride.distance).toBe(testRide.distance);
    });

    it('should handle invalid date formats in updates', async () => {
      const ride = await rideService.createRide(testRide);
      
      const params = {
        title: 'Updated Ride Title',
        when: 'not a valid date'
      };
      
      // Mock the date parser to return an error
      jest.spyOn(rideService, 'parseDateTimeInput').mockReturnValueOnce({
        date: null,
        error: 'Invalid date format'
      });
      
      const result = await rideService.updateRideFromParams(ride.id, params);
      
      expect(result.error).toBe('Invalid date format');
      expect(result.ride).toBeNull();
    });

    it('should handle invalid route URLs in updates', async () => {
      const ride = await rideService.createRide(testRide);
      
      const params = {
        route: 'not-a-valid-url'
      };
      
      // Mock route parser to return an error
      jest.spyOn(rideService, 'processRouteInfo').mockResolvedValueOnce({
        error: 'Invalid URL format. Please provide a valid URL.'
      });
      
      const result = await rideService.updateRideFromParams(ride.id, params);
      
      expect(result.error).toBe('Invalid URL format. Please provide a valid URL.');
      expect(result.ride).toBeNull();
    });
  });

  describe('Ride ID Extraction', () => {
    it('should extract ride ID from parameters', () => {
      const message = {
        text: '/updateride\nid: abc123\ntitle: New Title'
      };
      
      const result = rideService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });

    it('should extract ride ID from replied message', () => {
      const message = {
        text: '/updateride\ntitle: New Title',
        reply_to_message: {
          text: '🎫 Ride #abc123\nSome other content'
        }
      };
      
      const result = rideService.extractRideId(message);
      
      expect(result.rideId).toBe('abc123');
      expect(result.error).toBeNull();
    });

    it('should return error when no ID is found', () => {
      const message = {
        text: '/updateride\ntitle: New Title'
        // No reply and no ID parameter
      };
      
      const result = rideService.extractRideId(message);
      
      expect(result.rideId).toBeNull();
      expect(result.error).toBe('Please reply to the ride message or provide ID parameter.');
    });

    it('should return error when replied message has no ride ID', () => {
      const message = {
        text: '/updateride\ntitle: New Title',
        reply_to_message: {
          text: 'This is not a ride message'
        }
      };
      
      const result = rideService.extractRideId(message);
      
      expect(result.rideId).toBeNull();
      expect(result.error).toContain('Could not find ride ID in the message');
    });
  });

  describe('Ride Creator Validation', () => {
    it('should validate if user is the creator of a ride', () => {
      const ride = {
        id: 'abc123',
        createdBy: 789
      };
      
      expect(rideService.isRideCreator(ride, 789)).toBe(true);
      expect(rideService.isRideCreator(ride, 456)).toBe(false);
    });
  });
});
