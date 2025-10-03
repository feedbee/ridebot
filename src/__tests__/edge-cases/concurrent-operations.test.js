/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { MemoryStorage } from '../../storage/memory.js';

describe('Concurrent Operations Edge Cases', () => {
  let storage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should prevent duplicate participants when joining simultaneously', async () => {
    // Create a ride
    const ride = await storage.createRide({
      title: 'Test Ride',
      date: new Date(),
      creatorId: 12345,
      organizer: 'Test User',
      cancelled: false,
      participants: [],
      messages: []
    });

    const participant = {
      userId: 99999,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User'
    };

    // Simulate concurrent join attempts
    const [result1, result2] = await Promise.all([
      storage.addParticipant(ride.id, participant),
      storage.addParticipant(ride.id, participant)
    ]);

    // One should succeed, one should fail
    const successCount = [result1.success, result2.success].filter(Boolean).length;
    expect(successCount).toBe(1);

    // Final ride should only have one participant
    const finalRide = await storage.getRide(ride.id);
    expect(finalRide.participants).toHaveLength(1);
    expect(finalRide.participants[0].userId).toBe(99999);
  });

  it('should handle concurrent join and leave operations', async () => {
    // Create a ride with a participant
    const ride = await storage.createRide({
      title: 'Test Ride',
      date: new Date(),
      creatorId: 12345,
      organizer: 'Test User',
      cancelled: false,
      participants: [],
      messages: []
    });

    const participant = {
      userId: 99999,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User'
    };

    // First add the participant
    await storage.addParticipant(ride.id, participant);

    // Simulate concurrent operations: leave and join again
    const [leaveResult, joinResult] = await Promise.all([
      storage.removeParticipant(ride.id, participant.userId),
      storage.addParticipant(ride.id, participant)
    ]);

    // At least one operation should succeed
    expect(leaveResult.success || joinResult.success).toBe(true);

    // Final state should be consistent
    const finalRide = await storage.getRide(ride.id);
    expect(finalRide.participants.length).toBeLessThanOrEqual(1);
  });
});

