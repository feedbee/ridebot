/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { RideService } from '../../services/RideService.js';
import { MemoryStorage } from '../../storage/memory.js';
import { config } from '../../config.js';
import { t } from '../../i18n/index.js';
import { UserProfile } from '../../models/UserProfile.js';
import { SettingsService } from '../../services/SettingsService.js';

// Import the module first, then mock its methods
import { RouteParser } from '../../utils/route-parser.js';

// Setup mock for RouteParser.processRouteInfo
jest.spyOn(RouteParser, 'processRouteInfo');

describe('RideService', () => {
  let rideService;
  let storage;
  
  // Save original timezone config
  const originalTimezone = config.dateFormat.defaultTimezone;
  
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
    speedMax: 28,
    additionalInfo: 'Bring lights and a jacket'
  };

  const testParticipant = {
    userId: 101,
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User'
  };
  const testCreatorProfile = new UserProfile({
    userId: 789,
    username: 'creator',
    firstName: 'Test',
    lastName: 'Creator'
  });
  const tr = (language, key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Create a fresh storage instance for each test
    storage = new MemoryStorage();
    rideService = new RideService(storage);
    
    // Ensure no timezone is set for tests by default
    config.dateFormat.defaultTimezone = null;
  });

  afterAll(() => {
    config.dateFormat.defaultTimezone = originalTimezone;
  });

  describe('Basic CRUD Operations', () => {
    it('should create a ride', async () => {
      const ride = await rideService.createRide(testRide);
      
      expect(ride).toHaveProperty('id');
      expect(ride.title).toBe(testRide.title);
      expect(ride.date).toEqual(testRide.date);
      expect(ride.messages).toEqual(testRide.messages);
      expect(ride.settings).toEqual(SettingsService.getSystemRideDefaults());
    });

    it('should add the creator as the first joined participant when creator profile is provided', async () => {
      const ride = await rideService.createRide(testRide, testCreatorProfile);

      expect(ride.participation.joined).toHaveLength(1);
      expect(ride.participation.joined[0]).toEqual(expect.objectContaining({
        userId: testCreatorProfile.userId,
        username: testCreatorProfile.username,
        firstName: testCreatorProfile.firstName,
        lastName: testCreatorProfile.lastName
      }));
    });

    it('should get a ride by ID', async () => {
      const createdRide = await rideService.createRide(testRide);
      const retrievedRide = await rideService.getRide(createdRide.id);
      
      // Expect all properties except participation to match
      const { participation, ...retrievedRideWithoutParticipation } = retrievedRide;
      const { participation: createdParticipation, ...createdRideWithoutParticipation } = createdRide;
      
      expect(retrievedRideWithoutParticipation).toEqual(createdRideWithoutParticipation);
      // Participation should have empty arrays
      expect(participation.joined).toEqual([]);
      expect(participation.thinking).toEqual([]);
      expect(participation.skipped).toEqual([]);
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
    
    it('should resume a cancelled ride', async () => {
      // First create and cancel a ride
      const createdRide = await rideService.createRide(testRide);
      const cancelledRide = await rideService.cancelRide(createdRide.id);
      expect(cancelledRide.cancelled).toBe(true);
      
      // Now resume the ride
      const resumedRide = await rideService.resumeRide(cancelledRide.id);
      
      // Verify the ride is no longer cancelled
      expect(resumedRide.cancelled).toBe(false);
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

  describe('Participation Management', () => {
    it('should set participant to joined state', async () => {
      const ride = await rideService.createRide(testRide);
      const result = await rideService.setParticipation(ride.id, testParticipant, 'joined');
      
      expect(result.success).toBe(true);
      expect(result.ride.participation.joined).toHaveLength(1);
      const participant = result.ride.participation.joined[0];
      expect(participant.userId).toBe(testParticipant.userId);
      expect(participant.username).toBe(testParticipant.username);
      expect(participant.firstName).toBe(testParticipant.firstName);
      expect(participant.lastName).toBe(testParticipant.lastName);
    });

    it('should set participant to thinking state', async () => {
      const ride = await rideService.createRide(testRide);
      const result = await rideService.setParticipation(ride.id, testParticipant, 'thinking');
      
      expect(result.success).toBe(true);
      expect(result.ride.participation.thinking).toHaveLength(1);
      const participant = result.ride.participation.thinking[0];
      expect(participant.userId).toBe(testParticipant.userId);
    });

    it('should set participant to skipped state', async () => {
      const ride = await rideService.createRide(testRide);
      const result = await rideService.setParticipation(ride.id, testParticipant, 'skipped');
      
      expect(result.success).toBe(true);
      expect(result.ride.participation.skipped).toHaveLength(1);
      const participant = result.ride.participation.skipped[0];
      expect(participant.userId).toBe(testParticipant.userId);
    });

    it('should not change state if participant is already in desired state', async () => {
      const ride = await rideService.createRide(testRide);
      await rideService.setParticipation(ride.id, testParticipant, 'joined');
      const result = await rideService.setParticipation(ride.id, testParticipant, 'joined');
      
      expect(result.success).toBe(false);
      expect(result.ride).toBeNull();

      const updatedRide = await rideService.getRide(ride.id);
      expect(updatedRide.participation.joined).toHaveLength(1);
    });

    it('should move participant between states', async () => {
      const ride = await rideService.createRide(testRide);
      
      // Start with joined
      await rideService.setParticipation(ride.id, testParticipant, 'joined');
      expect((await rideService.getRide(ride.id)).participation.joined).toHaveLength(1);
      
      // Move to thinking
      const result1 = await rideService.setParticipation(ride.id, testParticipant, 'thinking');
      expect(result1.success).toBe(true);
      const ride1 = await rideService.getRide(ride.id);
      expect(ride1.participation.joined).toHaveLength(0);
      expect(ride1.participation.thinking).toHaveLength(1);
      
      // Move to skipped
      const result2 = await rideService.setParticipation(ride.id, testParticipant, 'skipped');
      expect(result2.success).toBe(true);
      const ride2 = await rideService.getRide(ride.id);
      expect(ride2.participation.thinking).toHaveLength(0);
      expect(ride2.participation.skipped).toHaveLength(1);
    });

    it('should handle non-existent participant gracefully', async () => {
      const ride = await rideService.createRide(testRide);
      const nonExistentParticipant = { userId: 999, username: 'nonexistent', firstName: 'Non', lastName: 'Existent' };
      const result = await rideService.setParticipation(ride.id, nonExistentParticipant, 'joined');

      expect(result.success).toBe(true);
      expect(result.ride.participation.joined).toHaveLength(1);
    });

    it('should return previousState as null when user had no prior state', async () => {
      const ride = await rideService.createRide(testRide);
      const result = await rideService.setParticipation(ride.id, testParticipant, 'joined');

      expect(result.success).toBe(true);
      expect(result.previousState).toBeNull();
    });

    it('should return previousState when user changes state', async () => {
      const ride = await rideService.createRide(testRide);
      await rideService.setParticipation(ride.id, testParticipant, 'joined');
      const result = await rideService.setParticipation(ride.id, testParticipant, 'thinking');

      expect(result.success).toBe(true);
      expect(result.previousState).toBe('joined');
    });

    it('should handle edge case with multiple participants', async () => {
      const ride = await rideService.createRide(testRide);
      const participant2 = { userId: 456, username: 'user2', firstName: 'User', lastName: 'Two' };
      
      // Add two participants to different states
      await rideService.setParticipation(ride.id, testParticipant, 'joined');
      await rideService.setParticipation(ride.id, participant2, 'thinking');
      
      const updatedRide = await rideService.getRide(ride.id);
      expect(updatedRide.participation.joined).toHaveLength(1);
      expect(updatedRide.participation.thinking).toHaveLength(1);
      expect(updatedRide.participation.skipped).toHaveLength(0);
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

  describe('Route Processing', () => {
    it('should use route parser data when available', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        route: 'https://example.com/route'
      };
      
      // Mock processRouteInfo
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile);
      
      expect(result.error).toBeNull();
      expect(result.ride.distance).toBe(50);
      expect(result.ride.duration).toBe(180);
      expect(RouteParser.processRouteInfo).toHaveBeenCalledWith('https://example.com/route');
    });

    it('should prioritize explicit parameters over route parser data', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        route: 'https://example.com/route',
        dist: '75',
        duration: '3h 30m'
      };
      
      // Mock processRouteInfo
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile);
      
      expect(result.error).toBeNull();
      expect(result.ride.distance).toBe(75); // From params, not from route parser
      expect(result.ride.duration).toBe(210); // From params (3h 30m = 210 minutes), not from route parser
      expect(RouteParser.processRouteInfo).toHaveBeenCalledWith('https://example.com/route');
    });

    it.each(['en', 'ru'])('should handle invalid route URLs in updates (%s)', async (language) => {
      const ride = await rideService.createRide(testRide);
      
      const params = {
        route: 'not-a-valid-url'
      };
      
      // Mock processRouteInfo to return an error
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        error: tr(language, 'utils.routeParser.invalidUrl'),
        routeLink: 'not-a-valid-url'
      });
      
      const result = await rideService.updateRideFromParams(ride.id, params, null, { language });
      
      expect(result.error).toBe(tr(language, 'utils.routeParser.invalidUrl'));
      expect(result.ride).toBeNull();
      expect(RouteParser.processRouteInfo).toHaveBeenCalledWith('not-a-valid-url', { language });
    });
  });

  describe('Ride Creation from Parameters', () => {
    it('should create a ride from valid parameters', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        meet: 'Coffee Shop',
        route: 'https://example.com/route',
        speed: '25-28',
        info: 'Bring water and snacks'
      };
      
      // Mock processRouteInfo
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/route'
      });
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile);
      
      expect(result.error).toBeNull();
      expect(result.ride).toHaveProperty('id');
      expect(result.ride.title).toBe(params.title);
      expect(result.ride.meetingPoint).toBe(params.meet);
      expect(result.ride.routeLink).toBe(params.route);
      expect(result.ride.speedMin).toBe(25);
      expect(result.ride.speedMax).toBe(28);
      expect(result.ride.additionalInfo).toBe(params.info);
    });

    it.each(['en', 'ru'])('should require title and date parameters (%s)', async (language) => {
      const params = {
        title: 'Sunday Morning Ride'
        // Missing 'when' parameter
      };
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile, { language });
      
      expect(result.error).toBe(tr(language, 'services.ride.pleaseProvideTitleAndDate'));
      expect(result.ride).toBeNull();
    });

    it.each(['en', 'ru'])('should handle invalid date formats (%s)', async (language) => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'not a valid date'
      };
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile, { language });
      
      // Check that the error message contains the base error text
      expect(result.error).toContain(tr(language, 'parsers.date.invalidFormat'));
      
      // The timezone note should not be present when no timezone is configured
      expect(result.error).not.toContain(tr(language, 'parsers.date.timezoneNote', { timezone: 'Europe/London' }));
      
      expect(result.ride).toBeNull();
    });
    
    it.each(['en', 'ru'])('should include timezone info in error message when timezone is configured (%s)', async (language) => {
      // Set a timezone for this specific test
      config.dateFormat.defaultTimezone = 'Europe/London';
      
      const params = {
        title: 'Sunday Morning Ride',
        when: 'not a valid date'
      };
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile, { language });
      
      // Check that the error message contains the base error text
      expect(result.error).toContain(tr(language, 'parsers.date.invalidFormat'));
      
      // The timezone note should be present when a timezone is configured
      expect(result.error).toContain(tr(language, 'parsers.date.timezoneNote', { timezone: 'Europe/London' }));
      
      expect(result.ride).toBeNull();
    });

    it('should use route parser data when available', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        route: 'https://example.com/route'
      };
      
      // Mock processRouteInfo
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile);
      
      expect(result.error).toBeNull();
      expect(result.ride.distance).toBe(50);
      expect(result.ride.duration).toBe(180);
      expect(RouteParser.processRouteInfo).toHaveBeenCalledWith('https://example.com/route');
    });

    it('should prioritize explicit parameters over route parser data', async () => {
      const params = {
        title: 'Sunday Morning Ride',
        when: 'tomorrow 9am',
        route: 'https://example.com/route',
        dist: '75',
        duration: '3h 30m'
      };
      
      // Mock processRouteInfo
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180
      });
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile);
      
      expect(result.error).toBeNull();
      expect(result.ride.distance).toBe(75); // From params, not from route parser
      expect(result.ride.duration).toBe(210); // From params (3h 30m = 210 minutes), not from route parser
      expect(RouteParser.processRouteInfo).toHaveBeenCalledWith('https://example.com/route');
    });

    it('should materialize a user on first createRideFromParams call and snapshot system defaults', async () => {
      const creator = new UserProfile({ userId: 501, username: 'u501' });

      const result = await rideService.createRideFromParams(
        { title: 'Morning Ride', when: 'tomorrow 9am' },
        1,
        creator
      );

      expect(result.error).toBeNull();
      expect(result.ride.settings).toEqual(SettingsService.getSystemRideDefaults());

      const storedUser = await storage.getUser(501);
      expect(storedUser).not.toBeNull();
      expect(storedUser.settings.rideDefaults).toEqual(SettingsService.getSystemRideDefaults());
    });

    it('should snapshot existing user defaults into a newly created ride', async () => {
      await storage.upsertUser({
        userId: 502,
        username: 'u502',
        settings: {
          rideDefaults: {
            notifyParticipation: false
          }
        }
      });

      const result = await rideService.createRideFromParams(
        { title: 'Quiet Ride', when: 'tomorrow 9am' },
        1,
        new UserProfile({ userId: 502, username: 'u502' })
      );

      expect(result.error).toBeNull();
      expect(result.ride.settings.notifyParticipation).toBe(false);
    });

    it('should merge text-based settings updates through the service update path', async () => {
      const ride = await rideService.createRide({
        ...testRide,
        settings: {
          notifyParticipation: true,
          futureSetting: 'preserved'
        }
      });

      const result = await rideService.updateRideFromParams(
        ride.id,
        { 'settings.notifyParticipation': 'no' },
        502
      );

      expect(result.error).toBeNull();
      expect(result.ride.settings).toEqual({
        notifyParticipation: false,
        futureSetting: 'preserved'
      });
      expect(result.ride.updatedBy).toBe(502);
    });

    it('should not retroactively change existing rides when user defaults change later', async () => {
      const creator = new UserProfile({ userId: 503, username: 'u503' });

      const firstResult = await rideService.createRideFromParams(
        { title: 'First Ride', when: 'tomorrow 9am' },
        1,
        creator
      );

      await storage.upsertUser({
        userId: 503,
        settings: {
          rideDefaults: {
            notifyParticipation: false
          }
        }
      });

      const secondResult = await rideService.createRideFromParams(
        { title: 'Second Ride', when: 'next friday 9am' },
        1,
        creator
      );

      expect(firstResult.error).toBeNull();
      expect(secondResult.error).toBeNull();
      expect(firstResult.ride.settings.notifyParticipation).toBe(true);
      expect(secondResult.ride.settings.notifyParticipation).toBe(false);
    });
  });

  describe('Organizer Field', () => {
    it('should set organizer field when creating a ride with organizer parameter', async () => {
      const params = {
        title: 'Organizer Test Ride',
        when: 'tomorrow 9am',
        organizer: 'Jane Doe'
      };
      
      const user = new UserProfile({
        userId: 789,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      });
      
      const result = await rideService.createRideFromParams(params, 123456, user);
      
      expect(result.error).toBeNull();
      expect(result.ride.organizer).toBe('Jane Doe');
      expect(result.ride.participation.joined).toEqual([
        expect.objectContaining({
          userId: user.userId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        })
      ]);
    });

    it('should use creator name as default organizer when no organizer parameter is provided', async () => {
      const params = {
        title: 'Default Organizer Test Ride',
        when: 'tomorrow 9am'
      };
      
      const user = new UserProfile({
        userId: 789,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      });
      
      const result = await rideService.createRideFromParams(params, 123456, user);
      
      expect(result.error).toBeNull();
      expect(result.ride.organizer).toBe('Test User (@testuser)');
    });

    it.each([
      ['ru', 'я'],
      ['ru', 'я сам'],
      ['en', 'me'],
      ['en', 'myself']
    ])('should use creator name as default organizer when organizer refers to self (%s: %s)', async (language, organizer) => {
      const params = {
        title: 'Self Organizer Test Ride',
        when: 'tomorrow 9am',
        organizer
      };

      const user = new UserProfile({
        userId: 789,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      });

      const result = await rideService.createRideFromParams(params, 123456, user, { language });

      expect(result.error).toBeNull();
      expect(result.ride.organizer).toBe('Test User (@testuser)');
    });

    it('should not treat another language self-reference as default organizer', async () => {
      const params = {
        title: 'Cross Language Organizer Test Ride',
        when: 'tomorrow 9am',
        organizer: 'me'
      };

      const user = new UserProfile({
        userId: 789,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      });

      const result = await rideService.createRideFromParams(params, 123456, user, { language: 'ru' });

      expect(result.error).toBeNull();
      expect(result.ride.organizer).toBe('me');
    });

    it('should resolve create organizer consistently for preview and persistence', () => {
      const user = new UserProfile({
        userId: 789,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      });

      expect(rideService.resolveCreateOrganizer(undefined, user, { language: 'ru' })).toBe('Test User (@testuser)');
      expect(rideService.resolveCreateOrganizer('я', user, { language: 'ru' })).toBe('Test User (@testuser)');
      expect(rideService.resolveCreateOrganizer('Bob', user, { language: 'ru' })).toBe('Bob');
    });

    it('should handle organizer field when updating a ride', async () => {
      // First create a ride
      const ride = await rideService.createRide(testRide);
      
      // Then update it with organizer
      const params = {
        organizer: 'Updated Organizer'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params);
      
      expect(result.error).toBeNull();
      expect(result.ride.organizer).toBe('Updated Organizer');
    });
    
    it('should clear organizer field when updating with dash', async () => {
      // First create a ride with organizer
      const ride = await rideService.createRide({
        ...testRide,
        organizer: 'Original Organizer'
      });
      
      // Then update it with dash to clear the field
      const params = {
        organizer: '-'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params);
      
      expect(result.error).toBeNull();
      expect(result.ride.organizer).toBe('');
    });
  });

  describe('Additional Information Field', () => {
    it('should handle additionalInfo field when creating a ride', async () => {
      const params = {
        title: 'Info Test Ride',
        when: 'tomorrow 9am',
        info: 'Important safety information'
      };
      
      const result = await rideService.createRideFromParams(params, 123456, testCreatorProfile);
      
      expect(result.error).toBeNull();
      expect(result.ride.additionalInfo).toBe('Important safety information');
    });
    
    it('should handle additionalInfo field when updating a ride', async () => {
      // Create a ride first
      const ride = await rideService.createRide(testRide);
      
      // Update with new additional info
      const params = {
        info: 'Updated information'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, 123456, 789);
      
      expect(result.error).toBeNull();
      expect(result.ride.additionalInfo).toBe('Updated information');
    });
    
    it('should clear additionalInfo field when updating with empty string', async () => {
      // Create a ride first with additionalInfo
      const ride = await rideService.createRide(testRide);
      
      // Update with empty additional info
      const params = {
        info: ''
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, 123456, 789);
      
      expect(result.error).toBeNull();
      expect(result.ride.additionalInfo).toBe('');
    });
    
    it('should clear additionalInfo field when updating with dash', async () => {
      // Create a ride with additional info
      const rideWithInfo = { ...testRide, additionalInfo: 'Original info' };
      const ride = await rideService.createRide(rideWithInfo);
      
      // Update with dash to clear the field
      const params = {
        info: '-'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.additionalInfo).toBe('');
    });
    
    it('should clear meeting point when updating with dash', async () => {
      // Create a ride with meeting point
      const rideWithMeetingPoint = { ...testRide, meetingPoint: 'Original meeting point' };
      const ride = await rideService.createRide(rideWithMeetingPoint);
      
      // Update with dash to clear the field
      const params = {
        meet: '-'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.meetingPoint).toBe('');
    });
    
    it('should clear route link when updating with dash', async () => {
      // Create a ride with route link
      const rideWithRoute = { ...testRide, routeLink: 'https://example.com/route' };
      const ride = await rideService.createRide(rideWithRoute);
      
      // Update with dash to clear the field
      const params = {
        route: '-'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.routeLink).toBe('');
    });
    
    it('should clear numeric fields when updating with dash', async () => {
      // Create a ride with numeric fields
      const rideWithNumericFields = { 
        ...testRide, 
        distance: 50, 
        duration: 120,
        speedMin: 25,
        speedMax: 30
      };
      const ride = await rideService.createRide(rideWithNumericFields);
      
      // Update with dash to clear the fields
      const params = {
        dist: '-',
        duration: '-',
        speed: '-'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.distance).toBeNull();
      expect(result.ride.duration).toBeNull();
      expect(result.ride.speedMin).toBeNull();
      expect(result.ride.speedMax).toBeNull();
    });

    it('should set average speed (min === max) when updating with a single value', async () => {
      const ride = await rideService.createRide({
        ...testRide,
        speedMin: 22,
        speedMax: 25
      });

      const result = await rideService.updateRideFromParams(ride.id, { speed: '29' }, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.speedMin).toBe(29);
      expect(result.ride.speedMax).toBe(29);
    });

    it('should set minimum speed when updating with explicit + suffix', async () => {
      const ride = await rideService.createRide({
        ...testRide,
        speedMin: 22,
        speedMax: 25
      });

      const result = await rideService.updateRideFromParams(ride.id, { speed: '29+' }, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.speedMin).toBe(29);
      expect(result.ride.speedMax).toBeNull();
    });

    it('should clear stale speed min when updating a range with a max-only value', async () => {
      const ride = await rideService.createRide({
        ...testRide,
        speedMin: 22,
        speedMax: 25
      });

      const result = await rideService.updateRideFromParams(ride.id, { speed: '-29' }, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.speedMin).toBeNull();
      expect(result.ride.speedMax).toBe(29);
    });

    it('should replace an existing single speed value with a full range', async () => {
      const ride = await rideService.createRide({
        ...testRide,
        speedMin: 22,
        speedMax: null
      });

      const result = await rideService.updateRideFromParams(ride.id, { speed: '24-27' }, 123456, 789);

      expect(result.error).toBeNull();
      expect(result.ride.speedMin).toBe(24);
      expect(result.ride.speedMax).toBe(27);
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
      
      const result = await rideService.updateRideFromParams(ride.id, params);
      
      expect(result.error).toBeNull();
      expect(result.ride.title).toBe(params.title);
      expect(result.ride.meetingPoint).toBe(params.meet);
      // Original fields should be preserved if not updated
      expect(result.ride.distance).toBe(testRide.distance);
    });

    it.each(['en', 'ru'])('should handle invalid date formats in updates (%s)', async (language) => {
      const ride = await storage.createRide({
        title: 'Original Ride',
        date: new Date('2024-03-15T15:00:00Z'),
        createdBy: 123456
      });
      
      const params = {
        when: 'not a valid date'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, null, { language });
      
      // Check that the error message contains the base error text
      expect(result.error).toContain(tr(language, 'parsers.date.invalidFormat'));
      
      // The timezone note should not be present when no timezone is configured
      expect(result.error).not.toContain(tr(language, 'parsers.date.timezoneNote', { timezone: 'Europe/London' }));
      
      expect(result.ride).toBeNull();
    });
    
    it.each(['en', 'ru'])('should include timezone info in update error message when timezone is configured (%s)', async (language) => {
      // Set a timezone for this specific test
      config.dateFormat.defaultTimezone = 'Europe/London';
      
      const ride = await storage.createRide({
        title: 'Original Ride',
        date: new Date('2024-03-15T15:00:00Z'),
        createdBy: 123456
      });
      
      const params = {
        when: 'not a valid date'
      };
      
      const result = await rideService.updateRideFromParams(ride.id, params, null, { language });
      
      // Check that the error message contains the base error text
      expect(result.error).toContain(tr(language, 'parsers.date.invalidFormat'));
      
      // The timezone note should be present when a timezone is configured
      expect(result.error).toContain(tr(language, 'parsers.date.timezoneNote', { timezone: 'Europe/London' }));
      
      expect(result.ride).toBeNull();
    });
    
    it.each(['en', 'ru'])('should handle invalid route URLs in updates (%s)', async (language) => {
      const ride = await storage.createRide({
        title: 'Original Ride',
        date: new Date('2024-03-15T15:00:00Z'),
        createdBy: 123456
      });
      
      const params = {
        route: 'not-a-valid-url'
      };
      
      // Mock processRouteInfo to return an error
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        error: tr(language, 'utils.routeParser.invalidUrl'),
        routeLink: 'not-a-valid-url'
      });
      
      const result = await rideService.updateRideFromParams(ride.id, params, null, { language });
      
      expect(result.error).toBe(tr(language, 'utils.routeParser.invalidUrl'));
      expect(result.ride).toBeNull();
      expect(RouteParser.processRouteInfo).toHaveBeenCalledWith('not-a-valid-url', { language });
    });
  });

  describe('Branch Coverage: service edge behaviors', () => {
    it('should add updatedBy in updateRide when userId is provided', async () => {
      const createdRide = await rideService.createRide(testRide);
      const updatedRide = await rideService.updateRide(createdRide.id, { title: 'Changed' }, 4242);

      expect(updatedRide.title).toBe('Changed');
      expect(updatedRide.updatedBy).toBe(4242);
    });

    it('should not add updatedBy in updateRide when updates are empty', async () => {
      const createdRide = await rideService.createRide(testRide);
      const updatedRide = await rideService.updateRide(createdRide.id, {}, 4242);
      expect(updatedRide.updatedBy).toBeUndefined();
    });

    it('should add updatedBy when cancelling and resuming with userId', async () => {
      const createdRide = await rideService.createRide(testRide);
      const cancelledRide = await rideService.cancelRide(createdRide.id, 111);
      expect(cancelledRide.cancelled).toBe(true);
      expect(cancelledRide.updatedBy).toBe(111);

      const resumedRide = await rideService.resumeRide(createdRide.id, 222);
      expect(resumedRide.cancelled).toBe(false);
      expect(resumedRide.updatedBy).toBe(222);
    });

    it('should return current ride when updateRideFromParams has no effective updates', async () => {
      const createdRide = await rideService.createRide(testRide);

      const result = await rideService.updateRideFromParams(createdRide.id, {});

      expect(result.error).toBeNull();
      expect(result.ride.id).toBe(createdRide.id);
      expect(result.ride.updatedBy).toBeUndefined();
    });

    it('should include updatedBy in updateRideFromParams when updates are present', async () => {
      const createdRide = await rideService.createRide(testRide);

      const result = await rideService.updateRideFromParams(createdRide.id, { title: 'Title 2' }, 99);

      expect(result.error).toBeNull();
      expect(result.ride.title).toBe('Title 2');
      expect(result.ride.updatedBy).toBe(99);
    });

    it('should apply parsed route data in updateRideFromParams when explicit values are absent', async () => {
      const createdRide = await rideService.createRide(testRide);
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/updated-route',
        distance: 88,
        duration: 250
      });

      const result = await rideService.updateRideFromParams(createdRide.id, {
        route: 'https://example.com/updated-route'
      });

      expect(result.error).toBeNull();
      expect(result.ride.routeLink).toBe('https://example.com/updated-route');
      expect(result.ride.distance).toBe(88);
      expect(result.ride.duration).toBe(250);
    });

    it('should prioritize explicit route params in updateRideFromParams over parser values', async () => {
      const createdRide = await rideService.createRide(testRide);
      RouteParser.processRouteInfo.mockResolvedValueOnce({
        routeLink: 'https://example.com/updated-route',
        distance: 88,
        duration: 250
      });

      const result = await rideService.updateRideFromParams(createdRide.id, {
        route: 'https://example.com/updated-route',
        dist: '95',
        duration: '3h'
      });

      expect(result.error).toBeNull();
      expect(result.ride.routeLink).toBe('https://example.com/updated-route');
      expect(result.ride.distance).toBe(95);
      expect(result.ride.duration).toBe(180);
    });

    it.each(['en', 'ru'])('should return generic error when updateRideFromParams throws unexpectedly (%s)', async (language) => {
      const createdRide = await rideService.createRide(testRide);
      jest.spyOn(storage, 'updateRide').mockRejectedValueOnce(new Error('Update failed'));

      const result = await rideService.updateRideFromParams(createdRide.id, { title: 'X' }, null, { language });

      expect(result.ride).toBeNull();
      expect(result.error).toBe(tr(language, 'services.ride.errorUpdatingRide'));
    });

    it.each(['en', 'ru'])('should return generic error when createRideFromParams throws unexpectedly (%s)', async (language) => {
      jest.spyOn(storage, 'createRide').mockRejectedValueOnce(new Error('DB exploded'));

      const result = await rideService.createRideFromParams(
        { title: 'X', when: 'tomorrow 9am' },
        1,
        new UserProfile({ userId: 1 }),
        { language }
      );

      expect(result.ride).toBeNull();
      expect(result.error).toBe(tr(language, 'services.ride.errorCreatingRide'));
    });

    it('should cover getDefaultOrganizer fallback variants', () => {
      expect(rideService.getDefaultOrganizer(null)).toBe('');
      expect(rideService.getDefaultOrganizer(new UserProfile({ userId: 1, username: 'user_no_space' }))).toBe('@user_no_space');
      expect(rideService.getDefaultOrganizer(new UserProfile({ userId: 1, username: 'name with space' }))).toBe('name with space');
      expect(rideService.getDefaultOrganizer(new UserProfile({ userId: 1, firstName: 'Jane', lastName: 'Doe' }))).toBe('Jane Doe');
    });

    it.each(['en', 'ru'])('should return not found error when duplicating unknown ride (%s)', async (language) => {
      const result = await rideService.duplicateRide('missing-ride', {}, new UserProfile({ userId: 1, username: 'u' }), { language });
      expect(result).toEqual({ ride: null, error: tr(language, 'services.ride.originalRideNotFound') });
    });

    it('should duplicate ride preserving key original fields by default', async () => {
      const originalRide = await rideService.createRide({
        ...testRide,
        date: new Date('2030-03-15T15:00:00Z'),
        speedMin: 26,
        speedMax: 30,
        organizer: 'Org',
        category: 'road',
        additionalInfo: 'Info'
      });
      const result = await rideService.duplicateRide(originalRide.id, {}, new UserProfile({ userId: 7, username: 'user7' }));

      expect(result.error).toBeNull();
      expect(result.ride).toBeDefined();
      expect(result.ride.id).not.toBe(originalRide.id);
      expect(result.ride.title).toBe(originalRide.title);
      expect(result.ride.category).toBe(originalRide.category);
      expect(result.ride.organizer).toBe(originalRide.organizer);
      expect(result.ride.meetingPoint).toBe(originalRide.meetingPoint);
      expect(result.ride.routeLink).toBe(originalRide.routeLink);
      expect(result.ride.distance).toBe(originalRide.distance);
      expect(result.ride.duration).toBe(originalRide.duration);
      expect(result.ride.speedMin).toBe(26);
      expect(result.ride.speedMax).toBe(30);
      expect(result.ride.additionalInfo).toBe(originalRide.additionalInfo);
    });

    it('should duplicate your own ride using the original ride settings snapshot', async () => {
      const creator = new UserProfile({ userId: 7, username: 'user7' });
      const originalRide = await rideService.createRide({
        ...testRide,
        date: new Date('2030-04-01T10:00:00Z'),
        createdBy: creator.userId,
        settings: {
          notifyParticipation: false
        }
      }, creator);

      const result = await rideService.duplicateRide(originalRide.id, {}, creator);

      expect(result.error).toBeNull();
      expect(result.ride.settings.notifyParticipation).toBe(false);
    });

    it('should duplicate another user\'s ride using the current user defaults', async () => {
      const originalRide = await rideService.createRide({
        ...testRide,
        date: new Date('2030-04-02T10:00:00Z'),
        createdBy: 999,
        settings: {
          notifyParticipation: true
        }
      });

      await storage.upsertUser({
        userId: 7,
        username: 'user7',
        settings: {
          rideDefaults: {
            notifyParticipation: false
          }
        }
      });

      const result = await rideService.duplicateRide(
        originalRide.id,
        {},
        new UserProfile({ userId: 7, username: 'user7' })
      );

      expect(result.error).toBeNull();
      expect(result.ride.settings.notifyParticipation).toBe(false);
    });

    it('should duplicate ride with single-bound speed values', async () => {
      const onlyMinRide = await rideService.createRide({
        ...testRide,
        date: new Date('2030-03-15T15:00:00Z'),
        speedMin: 24,
        speedMax: null
      });
      const onlyMaxRide = await rideService.createRide({
        ...testRide,
        date: new Date('2030-03-16T15:00:00Z'),
        title: 'Only max',
        speedMin: null,
        speedMax: 31
      });
      const minResult = await rideService.duplicateRide(onlyMinRide.id, {}, new UserProfile({ userId: 7 }));
      expect(minResult.error).toBeNull();
      expect(minResult.ride.speedMin).toBe(24);
      expect(minResult.ride.speedMax).toBeUndefined();

      const maxResult = await rideService.duplicateRide(onlyMaxRide.id, {}, new UserProfile({ userId: 7 }));
      expect(maxResult.error).toBeNull();
      expect([maxResult.ride.speedMin, maxResult.ride.speedMax]).toContain(31);
    });

    it('should clear routes when duplicating with route dash sentinel', async () => {
      const originalRide = await rideService.createRide({
        ...testRide,
        date: new Date('2030-03-17T15:00:00Z'),
        routes: [{ url: 'https://example.com/route', label: 'Main' }],
        routeLink: 'https://example.com/route'
      });

      const result = await rideService.duplicateRide(originalRide.id, { route: '-' }, new UserProfile({ userId: 7, username: 'user7' }));

      expect(result.error).toBeNull();
      expect(result.ride.routes).toEqual([]);
      expect(result.ride.routeLink).toBe('');
    });
  });
});
