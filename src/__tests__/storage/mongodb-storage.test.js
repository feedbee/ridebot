import { MongoDBStorage } from '../../storage/mongodb.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { config } from '../../config.js';

let mongoServer;
let storage;

const testRide = {
  title: 'Test Ride',
  date: new Date('2024-03-20T10:00:00Z'),
  messages: [{ chatId: 123456, messageId: 789012 }],
  createdBy: 789,
  routeLink: 'https://example.com/route',
  meetingPoint: 'Test Location',
  distance: 50,
  duration: 180,
  speedMin: 25,
  speedMax: 30,
  additionalInfo: 'This is additional information'
};

const testRideWithMessages = {
  title: 'Test Ride with Messages',
  date: new Date('2024-03-20T10:00:00Z'),
  messages: [{ chatId: 123456, messageId: 789012 }],
  createdBy: 789,
  routeLink: 'https://example.com/route',
  meetingPoint: 'Test Location',
  distance: 50,
  duration: 180,
  speedMin: 25,
  speedMax: 30
};

const testParticipant = {
  userId: 101,
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User'
};

beforeAll(async () => {
  // Set specific version for mongodb-memory-server
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '7.0.3',
    }
  });
  const mongoUri = mongoServer.getUri();
  config.mongodb.uri = mongoUri;
  storage = new MongoDBStorage();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('MongoDBStorage', () => {
  describe('Ride Management', () => {
    test('should create a new ride', async () => {
      const ride = await storage.createRide(testRide);
      
      // Verify the ride was created with expected properties
      expect(ride.title).toBe(testRide.title);
      expect(ride.date).toEqual(testRide.date);
      expect(ride.participants).toEqual([]);
      expect(ride.id).toBeDefined();
      
      // Verify messages array was maintained
      expect(ride.messages).toBeDefined();
      expect(ride.messages).toHaveLength(1);
      expect(ride.messages[0].chatId).toBe(testRide.messages[0].chatId);
      expect(ride.messages[0].messageId).toBe(testRide.messages[0].messageId);
    });

    test('should get a ride by id', async () => {
      const created = await storage.createRide(testRideWithMessages);
      const retrieved = await storage.getRide(created.id);
      
      // Verify basic properties
      expect(retrieved.title).toBe(testRideWithMessages.title);
      expect(retrieved.date.getTime()).toBe(testRideWithMessages.date.getTime());
      
      // Verify messages array
      expect(retrieved.messages).toHaveLength(1);
      expect(retrieved.messages[0].chatId).toBe(testRideWithMessages.messages[0].chatId);
      expect(retrieved.messages[0].messageId).toBe(testRideWithMessages.messages[0].messageId);
    });

    test('should update a ride', async () => {
      const created = await storage.createRide(testRideWithMessages);
      const updates = { title: 'Updated Ride', distance: 60 };
      const updated = await storage.updateRide(created.id, updates);
      
      // Verify updates were applied
      expect(updated.title).toBe(updates.title);
      expect(updated.distance).toBe(updates.distance);
      
      // Verify messages array was preserved
      expect(updated.messages).toHaveLength(1);
      expect(updated.messages[0].chatId).toBe(testRideWithMessages.messages[0].chatId);
      expect(updated.messages[0].messageId).toBe(testRideWithMessages.messages[0].messageId);
    });
    
    test('should update messages array', async () => {
      const created = await storage.createRide(testRide);
      
      // Update with new messages array
      const newMessages = [
        { messageId: 111111, chatId: 222222 },
        { messageId: 333333, chatId: 444444 }
      ];
      
      const updated = await storage.updateRide(created.id, { messages: newMessages });
      
      // Verify messages array was updated
      expect(updated.messages).toHaveLength(2);
      expect(updated.messages[0].messageId).toBe(111111);
      expect(updated.messages[0].chatId).toBe(222222);
      expect(updated.messages[1].messageId).toBe(333333);
      expect(updated.messages[1].chatId).toBe(444444);
    });

    test('should delete a ride', async () => {
      const created = await storage.createRide(testRide);
      const deleted = await storage.deleteRide(created.id);
      expect(deleted).toBe(true);
      const retrieved = await storage.getRide(created.id);
      expect(retrieved).toBeNull();
    });

    test('should get rides by creator', async () => {
      await storage.createRide(testRideWithMessages);
      await storage.createRide({
        ...testRideWithMessages,
        title: 'Second Ride'
      });

      const result = await storage.getRidesByCreator(testRide.createdBy, 0, 10);
      expect(result.total).toBe(2);
      expect(result.rides).toHaveLength(2);
      expect(result.rides[0].title).toBeDefined();
    });

    test('should preserve all ride fields when saving and retrieving', async () => {
      // Create a ride with all possible fields
      const completeRide = {
        title: 'Complete Test Ride',
        category: 'road',
        date: new Date('2024-03-20T10:00:00Z'),
        messages: [{ chatId: 123456, messageId: 789012, messageThreadId: 111222 }],
        routeLink: 'https://example.com/complete-route',
        meetingPoint: 'Complete Test Location',
        distance: 75,
        duration: 240,
        speedMin: 20,
        speedMax: 35,
        additionalInfo: 'This is important additional information that should be preserved',
        cancelled: false,
        createdBy: 999,
        participants: []
      };
      
      // Save the ride
      const created = await storage.createRide(completeRide);
      
      // Retrieve the ride
      const retrieved = await storage.getRide(created.id);
      
      // Verify all fields were preserved
      expect(retrieved.title).toBe(completeRide.title);
      expect(retrieved.category).toBe(completeRide.category);
      expect(retrieved.date.getTime()).toBe(completeRide.date.getTime());
      expect(retrieved.routeLink).toBe(completeRide.routeLink);
      expect(retrieved.meetingPoint).toBe(completeRide.meetingPoint);
      expect(retrieved.distance).toBe(completeRide.distance);
      expect(retrieved.duration).toBe(completeRide.duration);
      expect(retrieved.speedMin).toBe(completeRide.speedMin);
      expect(retrieved.speedMax).toBe(completeRide.speedMax);
      expect(retrieved.additionalInfo).toBe(completeRide.additionalInfo);
      expect(retrieved.cancelled).toBe(completeRide.cancelled);
      expect(retrieved.createdBy).toBe(completeRide.createdBy);
      
      // Verify messages array
      expect(retrieved.messages).toHaveLength(1);
      expect(retrieved.messages[0].chatId).toBe(completeRide.messages[0].chatId);
      expect(retrieved.messages[0].messageId).toBe(completeRide.messages[0].messageId);
      expect(retrieved.messages[0].messageThreadId).toBe(completeRide.messages[0].messageThreadId);
    });
  });

  describe('Participant Management', () => {
    let rideId;

    beforeEach(async () => {
      const ride = await storage.createRide(testRide);
      rideId = ride.id;
    });

    test('should add a participant', async () => {
      const result = await storage.addParticipant(rideId, testParticipant);
      expect(result.success).toBe(true);
      expect(result.ride).toBeDefined();
      expect(result.ride.participants).toHaveLength(1);
      
      // Check each property individually
      const participant = result.ride.participants[0];
      expect(participant.userId).toBe(testParticipant.userId);
      expect(participant.username).toBe(testParticipant.username);
      expect(participant.firstName).toBe(testParticipant.firstName);
      expect(participant.lastName).toBe(testParticipant.lastName);
    });

    test('should not add duplicate participant', async () => {
      await storage.addParticipant(rideId, testParticipant);
      const result = await storage.addParticipant(rideId, testParticipant);
      expect(result.success).toBe(false);
      expect(result.ride).toBeNull();

      const updatedRide = await storage.getRide(rideId);
      expect(updatedRide.participants).toHaveLength(1);
    });

    test('should remove a participant', async () => {
      await storage.addParticipant(rideId, testParticipant);
      const result = await storage.removeParticipant(rideId, testParticipant.userId);
      expect(result.success).toBe(true);
      expect(result.ride).toBeDefined();
      expect(result.ride.participants).toHaveLength(0);
    });

    test('should handle removing non-existent participant', async () => {
      const result = await storage.removeParticipant(rideId, 999);
      expect(result.success).toBe(false);
      expect(result.ride).toBeNull();
    });
  });
}); 
