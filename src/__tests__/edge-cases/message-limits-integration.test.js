/**
 * @jest-environment node
 * 
 * Edge case tests for Telegram message length limits.
 * Telegram has a 4096 character limit for text messages.
 */

import { jest } from '@jest/globals';
import { MessageFormatter } from '../../formatters/MessageFormatter.js';

describe('Message Limits Edge Cases', () => {
  let messageFormatter;

  beforeEach(() => {
    messageFormatter = new MessageFormatter();
  });

  it('should truncate messages that would exceed Telegram limit of 4096 chars', () => {
    // Create a ride that will generate a very long message
    const longText = 'A'.repeat(2000);
    const ride = {
      id: 'test123',
      title: longText,
      date: new Date('2025-10-10T10:00:00Z'),
      organizer: 'Test User',
      meetingPoint: longText,
      additionalInfo: longText,
      cancelled: false
    };

    const participants = Array.from({ length: 50 }, (_, i) => ({
      userId: i,
      username: `user${i}`,
      firstName: `First${i}`,
      lastName: `Last${i}`
    }));

    const result = messageFormatter.formatRideWithKeyboard(ride, participants);
    
    // Telegram's limit is 4096 characters for text messages
    // The formatter should truncate and add a marker
    expect(result.message.length).toBeLessThanOrEqual(4096);
    expect(result.message).toContain('(message truncated due to length)');
  });

  it('should handle normal-sized messages within Telegram limits', () => {
    const ride = {
      id: 'test123',
      title: 'Evening Ride',
      date: new Date('2025-10-10T18:00:00Z'),
      organizer: 'John Doe',
      meetingPoint: 'Central Park',
      distance: 35,
      additionalInfo: 'Bring lights',
      cancelled: false
    };

    const participants = Array.from({ length: 10 }, (_, i) => ({
      userId: i,
      username: `user${i}`,
      firstName: `First${i}`,
      lastName: `Last${i}`
    }));

    const result = messageFormatter.formatRideWithKeyboard(ride, participants);
    
    // Normal messages should be well under the limit
    expect(result.message.length).toBeLessThan(4096);
    expect(result.message).toContain('Evening Ride');
  });
});

