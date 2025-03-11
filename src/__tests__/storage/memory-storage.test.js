/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { MemoryStorage } from '../../storage/memory.js';

describe('MemoryStorage', () => {
  let storage;
  const testRide = {
    title: 'Test Ride',
    date: new Date('2024-03-15T15:00:00Z'),
    chatId: 123456,
    messageId: 789012,
    createdBy: 789,
    meetingPoint: 'Test Location',
    distance: 50,
    duration: 180,
    speedMin: 25,
    speedMax: 28
  };

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('ID Generation', () => {
    it('should generate unique IDs for rides', async () => {
      const ride1 = await storage.createRide(testRide);
      const ride2 = await storage.createRide(testRide);

      expect(ride1.id).toMatch(/^[0-9A-Za-z]{11}$/); // Should be 11 chars base62
      expect(ride2.id).toMatch(/^[0-9A-Za-z]{11}$/);
      expect(ride1.id).not.toBe(ride2.id);
    });

    it('should generate valid base62 strings', () => {
      const hex = 'a1b2c3d4e5f6';
      const base62 = storage.hexToBase62(hex);
      expect(base62).toMatch(/^[0-9A-Za-z]+$/);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when updating non-existent ride', async () => {
      await expect(storage.updateRide('non_existent', { title: 'New Title' }))
        .rejects
        .toThrow('Ride not found');
    });

    it('should throw error when accessing participants of non-existent ride', async () => {
      await expect(storage.getParticipants('non_existent'))
        .rejects
        .toThrow('Ride not found');
    });

    it('should throw error when adding participant to non-existent ride', async () => {
      await expect(storage.addParticipant('non_existent', { userId: 123, username: 'test' }))
        .rejects
        .toThrow('Ride not found');
    });
  });

  describe('Data Persistence', () => {
    it('should maintain ride data between operations', async () => {
      // Create ride
      const ride = await storage.createRide(testRide);
      
      // Add participant
      await storage.addParticipant(ride.id, { userId: 123, username: 'test' });
      
      // Update ride
      await storage.updateRide(ride.id, { title: 'Updated Ride' });
      
      // Verify all data is maintained
      const updatedRide = await storage.getRide(ride.id);
      const participants = await storage.getParticipants(ride.id);
      
      expect(updatedRide.title).toBe('Updated Ride');
      expect(participants).toHaveLength(1);
      expect(participants[0].username).toBe('test');
    });

    it('should maintain separate participant lists for different rides', async () => {
      const ride1 = await storage.createRide(testRide);
      const ride2 = await storage.createRide({ ...testRide, title: 'Second Ride' });

      await storage.addParticipant(ride1.id, { userId: 123, username: 'user1' });
      await storage.addParticipant(ride2.id, { userId: 456, username: 'user2' });

      const participants1 = await storage.getParticipants(ride1.id);
      const participants2 = await storage.getParticipants(ride2.id);

      expect(participants1).toHaveLength(1);
      expect(participants2).toHaveLength(1);
      expect(participants1[0].username).toBe('user1');
      expect(participants2[0].username).toBe('user2');
    });
  });

  describe('Ride Listing', () => {
    it('should sort rides by date in descending order', async () => {
      // Create rides with different dates
      await storage.createRide({
        ...testRide,
        title: 'Ride 1',
        date: new Date('2024-03-15T15:00:00Z')
      });
      await storage.createRide({
        ...testRide,
        title: 'Ride 2',
        date: new Date('2024-03-16T15:00:00Z')
      });
      await storage.createRide({
        ...testRide,
        title: 'Ride 3',
        date: new Date('2024-03-17T15:00:00Z')
      });

      const result = await storage.getRidesByCreator(789, 0, 10);
      
      // Verify descending order
      expect(result.rides[0].date.getTime()).toBeGreaterThan(result.rides[1].date.getTime());
      expect(result.rides[1].date.getTime()).toBeGreaterThan(result.rides[2].date.getTime());
    });
  });
}); 
