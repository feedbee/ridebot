import { MongoDBStorage } from '../../storage/mongodb.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { config } from '../../config.js';

let mongoServer;
let storage;

const testRide = {
  title: 'Test Ride',
  date: new Date('2024-03-20T10:00:00Z'),
  chatId: 123456,
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
      expect(ride).toMatchObject({
        ...testRide,
        participants: []
      });
      expect(ride.id).toBeDefined();
    });

    test('should get a ride by id', async () => {
      const created = await storage.createRide(testRide);
      const retrieved = await storage.getRide(created.id);
      expect(retrieved).toMatchObject(testRide);
    });

    test('should update a ride', async () => {
      const created = await storage.createRide(testRide);
      const updates = { title: 'Updated Ride', distance: 60 };
      const updated = await storage.updateRide(created.id, updates);
      expect(updated).toMatchObject({
        ...testRide,
        ...updates
      });
    });

    test('should delete a ride', async () => {
      const created = await storage.createRide(testRide);
      const deleted = await storage.deleteRide(created.id);
      expect(deleted).toBe(true);
      const retrieved = await storage.getRide(created.id);
      expect(retrieved).toBeNull();
    });

    test('should get rides by creator', async () => {
      await storage.createRide(testRide);
      await storage.createRide({
        ...testRide,
        title: 'Second Ride'
      });

      const result = await storage.getRidesByCreator(testRide.createdBy, 0, 10);
      expect(result.total).toBe(2);
      expect(result.rides).toHaveLength(2);
      expect(result.rides[0].title).toBeDefined();
    });
  });

  describe('Participant Management', () => {
    let rideId;

    beforeEach(async () => {
      const ride = await storage.createRide(testRide);
      rideId = ride.id;
    });

    test('should add a participant', async () => {
      const added = await storage.addParticipant(rideId, testParticipant);
      expect(added).toBe(true);

      const participants = await storage.getParticipants(rideId);
      expect(participants).toHaveLength(1);
      
      // Check each property individually
      const participant = participants[0];
      expect(participant.userId).toBe(testParticipant.userId);
      expect(participant.username).toBe(testParticipant.username);
      expect(participant.firstName).toBe(testParticipant.firstName);
      expect(participant.lastName).toBe(testParticipant.lastName);
    });

    test('should not add duplicate participant', async () => {
      await storage.addParticipant(rideId, testParticipant);
      const added = await storage.addParticipant(rideId, testParticipant);
      expect(added).toBe(false);

      const participants = await storage.getParticipants(rideId);
      expect(participants).toHaveLength(1);
    });

    test('should remove a participant', async () => {
      await storage.addParticipant(rideId, testParticipant);
      const removed = await storage.removeParticipant(rideId, testParticipant.userId);
      expect(removed).toBe(true);

      const participants = await storage.getParticipants(rideId);
      expect(participants).toHaveLength(0);
    });

    test('should handle removing non-existent participant', async () => {
      const removed = await storage.removeParticipant(rideId, 999);
      expect(removed).toBe(false);
    });
  });
}); 
