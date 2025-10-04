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
      storage.setParticipation(ride.id, participant.userId, 'joined', participant),
      storage.setParticipation(ride.id, participant.userId, 'joined', participant)
    ]);

    // Both should succeed (new API allows state changes)
    expect(result1.ride).toBeDefined();
    expect(result2.ride).toBeDefined();

    // Final ride should only have one participant
    const finalRide = await storage.getRide(ride.id);
    expect(finalRide.participation.joined).toHaveLength(1);
    expect(finalRide.participation.joined[0].userId).toBe(99999);
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
    await storage.setParticipation(ride.id, participant.userId, 'joined', participant);

    // Simulate concurrent operations: leave and join again
    const [leaveResult, joinResult] = await Promise.all([
      storage.setParticipation(ride.id, participant.userId, 'skipped', participant),
      storage.setParticipation(ride.id, participant.userId, 'joined', participant)
    ]);

    // Both operations should succeed
    expect(leaveResult.ride).toBeDefined();
    expect(joinResult.ride).toBeDefined();

    // Final state should be consistent
    const finalRide = await storage.getRide(ride.id);
    expect(finalRide.participation.joined.length).toBeLessThanOrEqual(1);
  });
});

