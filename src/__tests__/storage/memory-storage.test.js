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
    messages: [{ chatId: 123456, messageId: 789012 }],
    createdBy: 789,
    meetingPoint: 'Test Location',
    distance: 50,
    duration: 180,
    speedMin: 25,
    speedMax: 28
  };
  
  const testRideWithMessages = {
    title: 'Test Ride with Messages',
    date: new Date('2024-03-15T15:00:00Z'),
    messages: [{ chatId: 123456, messageId: 789012 }],
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

    it('should throw error when accessing a non-existent ride', async () => {
      await expect(storage.getRide('non_existent'))
        .resolves
        .toBeNull();
    });

    it('should throw error when setting participation for non-existent ride', async () => {
      await expect(storage.setParticipation('non_existent', 123, 'joined', { userId: 123, username: 'test', firstName: 'Test', lastName: 'User' }))
        .rejects
        .toThrow('Ride not found');
    });
  });

  describe('Data Persistence', () => {
    it('should maintain ride data between operations', async () => {
      // Create ride
      const ride = await storage.createRide(testRide);
      
      // Add participant
      const result = await storage.setParticipation(ride.id, 123, 'joined', { userId: 123, username: 'test', firstName: 'Test', lastName: 'User' });
      expect(result.ride.participation.joined).toHaveLength(1);
      
      // Update ride
      const updated = await storage.updateRide(ride.id, { title: 'Updated Ride' });
      expect(updated.title).toBe('Updated Ride');
      
      // Verify all data is maintained
      const updatedRide = await storage.getRide(ride.id);
      
      expect(updatedRide.title).toBe('Updated Ride');
      expect(updatedRide.participation.joined).toHaveLength(1);
      expect(updatedRide.participation.joined[0].username).toBe('test');
      
      // Verify messages array is maintained
      expect(updatedRide.messages).toBeDefined();
      expect(updatedRide.messages).toHaveLength(1);
      expect(updatedRide.messages[0].chatId).toBe(testRide.messages[0].chatId);
      expect(updatedRide.messages[0].messageId).toBe(testRide.messages[0].messageId);
    });

    it('should maintain separate participant lists for different rides', async () => {
      const ride1 = await storage.createRide(testRide);
      const ride2 = await storage.createRide({ ...testRide, title: 'Second Ride' });

      const result1 = await storage.setParticipation(ride1.id, 123, 'joined', { userId: 123, username: 'user1', firstName: 'First', lastName: 'User' });
      expect(result1.ride.participation.joined).toHaveLength(1);

      const result2 = await storage.setParticipation(ride2.id, 456, 'joined', { userId: 456, username: 'user2', firstName: 'Second', lastName: 'User' });
      expect(result2.ride.participation.joined).toHaveLength(1);

      const updatedRide1 = await storage.getRide(ride1.id);
      const updatedRide2 = await storage.getRide(ride2.id);

      expect(updatedRide1.participation.joined).toHaveLength(1);
      expect(updatedRide2.participation.joined).toHaveLength(1);
      expect(updatedRide1.participation.joined[0].username).toBe('user1');
      expect(updatedRide2.participation.joined[0].username).toBe('user2');
    });
  });

  describe('Ride Listing', () => {
    it('should sort rides by date in descending order', async () => {
      // Create rides with different dates
      await storage.createRide({
        ...testRideWithMessages,
        title: 'Ride 1',
        date: new Date('2024-03-15T15:00:00Z')
      });
      await storage.createRide({
        ...testRideWithMessages,
        title: 'Ride 2',
        date: new Date('2024-03-16T15:00:00Z')
      });
      await storage.createRide({
        ...testRideWithMessages,
        title: 'Ride 3',
        date: new Date('2024-03-17T15:00:00Z')
      });

      const result = await storage.getRidesByCreator(789, 0, 10);
      
      // Verify descending order
      expect(result.rides[0].date.getTime()).toBeGreaterThan(result.rides[1].date.getTime());
      expect(result.rides[1].date.getTime()).toBeGreaterThan(result.rides[2].date.getTime());
    });
  });
  
  describe('Messages Array Handling', () => {
    it('should add a new message to the messages array', async () => {
      // Create ride with initial message
      const ride = await storage.createRide(testRide);
      
      // Update with new messages array
      const newMessages = [
        ...ride.messages,
        { messageId: 111111, chatId: 222222 }
      ];
      
      const updatedRide = await storage.updateRide(ride.id, { 
        messages: newMessages
      });
      
      // Verify messages array was updated
      expect(updatedRide.messages).toHaveLength(2);
      expect(updatedRide.messages[0].messageId).toBe(testRide.messages[0].messageId);
      expect(updatedRide.messages[0].chatId).toBe(testRide.messages[0].chatId);
      expect(updatedRide.messages[1].messageId).toBe(111111);
      expect(updatedRide.messages[1].chatId).toBe(222222);
    });
    
    it('should replace the messages array when provided', async () => {
      // Create ride
      const ride = await storage.createRide(testRide);
      
      // Update with new messages array
      const newMessages = [
        { messageId: 111111, chatId: 222222 },
        { messageId: 333333, chatId: 444444 }
      ];
      
      const updatedRide = await storage.updateRide(ride.id, { 
        messages: newMessages
      });
      
      // Verify messages array was updated
      expect(updatedRide.messages).toHaveLength(2);
      expect(updatedRide.messages[0].messageId).toBe(111111);
      expect(updatedRide.messages[0].chatId).toBe(222222);
      expect(updatedRide.messages[1].messageId).toBe(333333);
      expect(updatedRide.messages[1].chatId).toBe(444444);
    });
  });
}); 
