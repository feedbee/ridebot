/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { MessageFormatter } from '../../formatters/MessageFormatter.js';
import { config } from '../../config.js';

// Mock the grammy module
jest.mock('grammy', () => {
  return {
    InlineKeyboard: jest.fn().mockImplementation(() => {
      return {
        text: jest.fn().mockReturnThis(),
        row: jest.fn().mockReturnThis()
      };
    })
  };
});

describe('MessageFormatter', () => {
  let messageFormatter;
  
  beforeEach(() => {
    messageFormatter = new MessageFormatter();
  });
  
  describe('formatRideWithKeyboard', () => {
    it('should return formatted message with keyboard', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location'
      };
      
      const participants = [
        { userId: 456, firstName: 'Test', lastName: 'User', username: 'testuser' }
      ];
      
      // Mock the formatRideMessage and getRideKeyboard methods
      messageFormatter.formatRideMessage = jest.fn().mockReturnValue('Formatted message');
      messageFormatter.getRideKeyboard = jest.fn().mockReturnValue({ inline_keyboard: [] });
      
      // Execute
      const result = messageFormatter.formatRideWithKeyboard(ride, participants);
      
      // Verify
      expect(messageFormatter.formatRideMessage).toHaveBeenCalledWith(ride, participants);
      expect(messageFormatter.getRideKeyboard).toHaveBeenCalledWith(ride);
      expect(result).toEqual({
        message: 'Formatted message',
        keyboard: { inline_keyboard: [] },
        parseMode: 'HTML'
      });
    });
  });
  
  describe('getRideKeyboard', () => {
    it('should return an InlineKeyboard instance', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        cancelled: false
      };
      
      // Execute
      const result = messageFormatter.getRideKeyboard(ride);
      
      // Verify
      expect(result).toBeDefined();
    });
    
    it('should handle cancelled rides', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        cancelled: true
      };
      
      // Execute
      const result = messageFormatter.getRideKeyboard(ride);
      
      // Verify
      expect(result).toBeDefined();
    });
  });
  
  describe('formatRideMessage', () => {
    it('should format ride message with all fields', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 120,
        speedMin: 25,
        speedMax: 30,
        cancelled: false
      };
      
      const participants = [
        { userId: 456, firstName: 'Test', lastName: 'User', username: 'testuser' }
      ];
      
      // Mock the formatDuration and formatSpeedRange methods
      messageFormatter.formatDuration = jest.fn().mockReturnValue('2 h');
      messageFormatter.formatSpeedRange = jest.fn().mockReturnValue('25-30 km/h');
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants);
      
      // Verify
      expect(result).toContain('Test Ride');
      expect(result).toContain('Test Location');
      expect(result).toContain('https://example.com/route');
      expect(result).toContain('50 km');
      expect(result).toContain('Ride #123');
      expect(messageFormatter.formatDuration).toHaveBeenCalledWith(120);
      expect(messageFormatter.formatSpeedRange).toHaveBeenCalledWith(25, 30);
    });
    
    it('should format ride message with cancelled status', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        cancelled: true
      };
      
      const participants = [];
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants);
      
      // Verify
      expect(result).toContain(config.messageTemplates.cancelled);
      expect(result).toContain('No participants yet');
      expect(result).toContain(config.messageTemplates.cancelledInstructions.replace('{id}', '123'));
    });
    
    it('should handle empty optional fields', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z'),
        cancelled: false
      };
      
      const participants = [];
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants);
      
      // Verify
      expect(result).not.toContain('Meeting point');
      expect(result).not.toContain('Route');
      expect(result).not.toContain('Distance');
      expect(result).not.toContain('Duration');
      expect(result).not.toContain('Speed');
    });
    
    it('should format participants correctly', () => {
      // Setup
      const ride = {
        id: '123',
        title: 'Test Ride',
        date: new Date('2025-03-30T10:00:00Z')
      };
      
      const participants = [
        { userId: 456, firstName: 'Test1', lastName: 'User1', username: 'testuser1' },
        { userId: 789, firstName: 'Test2', lastName: 'User2' }, // No username
        { userId: 101112, username: 'testuser3' } // Legacy format
      ];
      
      // Execute
      const result = messageFormatter.formatRideMessage(ride, participants);
      
      // Verify
      expect(result).toContain('<a href="tg://user?id=456">Test1 User1 (@testuser1)</a>');
      expect(result).toContain('<a href="tg://user?id=789">Test2 User2</a>');
      expect(result).toContain('<a href="tg://user?id=101112">@testuser3</a>');
    });
  });
  
  describe('formatRidesList', () => {
    it('should format a list of rides', () => {
      // Setup
      const rides = [
        {
          id: '123',
          title: 'Test Ride 1',
          date: new Date('2025-03-30T10:00:00Z'),
          meetingPoint: 'Location 1'
        },
        {
          id: '456',
          title: 'Test Ride 2',
          date: new Date('2025-03-31T11:00:00Z'),
          cancelled: true
        }
      ];
      
      // Execute
      const result = messageFormatter.formatRidesList(rides, 0, 1);
      
      // Verify
      expect(result).toContain('Your Rides');
      expect(result).toContain('Test Ride 1');
      expect(result).toContain('Location 1');
      expect(result).toContain('Test Ride 2');
      expect(result).toContain('CANCELLED');
      expect(result).toContain('Ride #123');
      expect(result).toContain('Ride #456');
    });
    
    it('should handle empty rides list', () => {
      // Execute
      const result = messageFormatter.formatRidesList([], 0, 0);
      
      // Verify
      expect(result).toBe('You have not created any rides yet.');
    });
    
    it('should include pagination info when there are multiple pages', () => {
      // Setup
      const rides = [
        {
          id: '123',
          title: 'Test Ride',
          date: new Date('2025-03-30T10:00:00Z')
        }
      ];
      
      // Execute
      const result = messageFormatter.formatRidesList(rides, 1, 3);
      
      // Verify
      expect(result).toContain('Page 2/3');
    });
  });
  
  describe('formatDuration', () => {
    it('should format duration less than an hour', () => {
      expect(messageFormatter.formatDuration(45)).toBe('45 min');
    });
    
    it('should format duration of exact hours', () => {
      expect(messageFormatter.formatDuration(120)).toBe('2 h');
    });
    
    it('should format duration with hours and minutes', () => {
      expect(messageFormatter.formatDuration(125)).toBe('2 h 5 min');
    });
  });
  
  describe('formatSpeedRange', () => {
    it('should format speed range with min and max', () => {
      expect(messageFormatter.formatSpeedRange(25, 30)).toBe('25-30 km/h');
    });
    
    it('should format speed range with only min', () => {
      expect(messageFormatter.formatSpeedRange(25, null)).toBe('25+ km/h');
    });
    
    it('should format speed range with only max', () => {
      expect(messageFormatter.formatSpeedRange(null, 30)).toBe('up to 30 km/h');
    });
  });
});
