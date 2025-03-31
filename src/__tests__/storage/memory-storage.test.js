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

    it('should throw error when accessing participants of non-existent ride', async () => {
      await expect(storage.getParticipants('non_existent'))
        .rejects
        .toThrow('Ride not found');
    });

    it('should throw error when adding participant to non-existent ride', async () => {
      await expect(storage.addParticipant('non_existent', { userId: 123, username: 'test', firstName: 'Test', lastName: 'User' }))
        .rejects
        .toThrow('Ride not found');
    });
  });

  describe('Data Persistence', () => {
    it('should maintain ride data between operations with legacy format', async () => {
      // Create ride with legacy format
      const ride = await storage.createRide(testRide);
      
      // Add participant
      await storage.addParticipant(ride.id, { userId: 123, username: 'test', firstName: 'Test', lastName: 'User' });
      
      // Update ride
      await storage.updateRide(ride.id, { title: 'Updated Ride' });
      
      // Verify all data is maintained
      const updatedRide = await storage.getRide(ride.id);
      const participants = await storage.getParticipants(ride.id);
      
      expect(updatedRide.title).toBe('Updated Ride');
      expect(participants).toHaveLength(1);
      expect(participants[0].username).toBe('test');
      
      // Verify messages array was created
      expect(updatedRide.messages).toBeDefined();
      expect(updatedRide.messages).toHaveLength(1);
      expect(updatedRide.messages[0].chatId).toBe(testRide.chatId);
      expect(updatedRide.messages[0].messageId).toBe(testRide.messageId);
      
      // Verify backward compatibility
      expect(updatedRide.chatId).toBe(testRide.chatId);
      expect(updatedRide.messageId).toBe(testRide.messageId);
    });
    
    it('should maintain ride data between operations with new messages format', async () => {
      // Create ride with new messages format
      const ride = await storage.createRide(testRideWithMessages);
      
      // Add participant
      await storage.addParticipant(ride.id, { userId: 123, username: 'test', firstName: 'Test', lastName: 'User' });
      
      // Update ride
      await storage.updateRide(ride.id, { title: 'Updated Ride' });
      
      // Verify all data is maintained
      const updatedRide = await storage.getRide(ride.id);
      const participants = await storage.getParticipants(ride.id);
      
      expect(updatedRide.title).toBe('Updated Ride');
      expect(participants).toHaveLength(1);
      expect(participants[0].username).toBe('test');
      
      // Verify messages array is maintained
      expect(updatedRide.messages).toBeDefined();
      expect(updatedRide.messages).toHaveLength(1);
      expect(updatedRide.messages[0].chatId).toBe(testRideWithMessages.messages[0].chatId);
      expect(updatedRide.messages[0].messageId).toBe(testRideWithMessages.messages[0].messageId);
      
      // Verify backward compatibility fields
      expect(updatedRide.chatId).toBe(testRideWithMessages.messages[0].chatId);
      expect(updatedRide.messageId).toBe(testRideWithMessages.messages[0].messageId);
    });

    it('should maintain separate participant lists for different rides', async () => {
      const ride1 = await storage.createRide(testRide);
      const ride2 = await storage.createRide({ ...testRide, title: 'Second Ride' });

      await storage.addParticipant(ride1.id, { userId: 123, username: 'user1', firstName: 'First', lastName: 'User' });
      await storage.addParticipant(ride2.id, { userId: 456, username: 'user2', firstName: 'Second', lastName: 'User' });

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
    it('should update the first message when updating messageId/chatId directly', async () => {
      // Create ride with legacy format
      const ride = await storage.createRide(testRide);
      
      // Update messageId/chatId directly
      const updatedRide = await storage.updateRide(ride.id, { 
        messageId: 999999,
        chatId: 888888
      });
      
      // Verify messages array was updated
      expect(updatedRide.messages).toHaveLength(1);
      expect(updatedRide.messages[0].messageId).toBe(999999);
      expect(updatedRide.messages[0].chatId).toBe(888888);
      
      // Verify backward compatibility fields
      expect(updatedRide.messageId).toBe(999999);
      expect(updatedRide.chatId).toBe(888888);
    });
    
    it('should add a new message when updating empty messages array with messageId/chatId', async () => {
      // Create ride with no messages
      const noMessagesRide = {
        title: 'Ride with no messages',
        date: new Date('2024-03-15T15:00:00Z'),
        createdBy: 789,
        messages: []
      };
      
      const ride = await storage.createRide(noMessagesRide);
      
      // Update messageId/chatId directly
      const updatedRide = await storage.updateRide(ride.id, { 
        messageId: 111111,
        chatId: 222222
      });
      
      // Verify a new message was added to the array
      expect(updatedRide.messages).toHaveLength(1);
      expect(updatedRide.messages[0].messageId).toBe(111111);
      expect(updatedRide.messages[0].chatId).toBe(222222);
      
      // Verify backward compatibility fields
      expect(updatedRide.messageId).toBe(111111);
      expect(updatedRide.chatId).toBe(222222);
    });
    
    it('should directly update the messages array when provided', async () => {
      // Create ride with legacy format
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
      
      // Verify backward compatibility fields use first message
      expect(updatedRide.messageId).toBe(111111);
      expect(updatedRide.chatId).toBe(222222);
    });
  });
}); 
