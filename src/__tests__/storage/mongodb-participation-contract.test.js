import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoDBStorage } from '../../storage/mongodb.js';

describe('Mongo storage query contracts without a database', () => {
  const Ride = mongoose.model('Ride');
  const profile = { userId: 2, firstName: '$title', lastName: '$$ROOT', username: 'user' };
  const ride = {
    _id: new mongoose.Types.ObjectId(), title: 'Ride', date: new Date('2099-01-01'),
    createdBy: 1, settings: { requireParticipationApproval: true },
    participation: { joined: [], thinking: [], skipped: [] }, messages: []
  };
  let storage;

  beforeEach(() => {
    storage = Object.create(MongoDBStorage.prototype);
    jest.spyOn(Ride, 'findById').mockResolvedValue(ride);
    jest.spyOn(Ride.collection, 'findOneAndUpdate').mockResolvedValue(ride);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['regular', 'moderated'])('executes a %s pipeline and treats profile text as literal data', async mode => {
    const result = mode === 'regular'
      ? await storage.setParticipation(String(ride._id), 'joined', profile)
      : await storage.setParticipationForRideMode(String(ride._id), 'thinking', profile, true, null);

    expect(result.status).toBe('changed');
    const pipeline = Ride.collection.findOneAndUpdate.mock.calls[0][1];
    const set = pipeline[0].$set;
    const expression = mode === 'regular' ? set['participation.joined'] : set['participation.thinking'];
    expect(expression.$concatArrays[1]).toEqual({
      $literal: [expect.objectContaining(profile)]
    });
  });

  it.each(['participation', 'decision', 'cancel', 'resume'])('guards the archive boundary in the %s write query', async operation => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    try {
      if (operation === 'participation') {
        await storage.setParticipationForRideMode(String(ride._id), 'thinking', profile, true, null);
      } else if (operation === 'decision') {
        await storage.setParticipationIfCurrent(String(ride._id), 2, 'thinking', 'joined', profile);
      } else {
        await storage.setRideCancelledIfActive(String(ride._id), operation === 'cancel', 1);
      }
      const filter = Ride.collection.findOneAndUpdate.mock.calls[0][0];
      expect(filter.date).toEqual({ $gt: new Date('2026-10-03T11:00:00Z') });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['participation', 'decision', 'cancel'])('reports archival after a rejected %s write', async operation => {
    Ride.collection.findOneAndUpdate.mockResolvedValue(null);
    Ride.findById.mockResolvedValue({ ...ride, date: new Date('2000-01-01') });
    const result = operation === 'participation'
      ? await storage.setParticipationForRideMode(String(ride._id), 'thinking', profile, true, null)
      : operation === 'decision'
        ? await storage.setParticipationIfCurrent(String(ride._id), 2, 'thinking', 'joined', profile)
        : await storage.setRideCancelledIfActive(String(ride._id), true, 1);
    expect(result.status).toBe('ride_archived');
  });

  it('writes a ride setting patch without replacing unrelated settings or tracking', async () => {
    await storage.updateRide(String(ride._id), { settings: { participantLimit: 10 } });
    expect(Ride.collection.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { 'settings.participantLimit': 10 }
    });
  });

  it('writes user default and notification patches as separate fields', async () => {
    const User = mongoose.model('User');
    jest.spyOn(User.collection, 'findOneAndUpdate').mockResolvedValue({ userId: 2, settings: {} });
    await storage.upsertUser({ userId: 2, settings: {
      rideDefaults: { participantLimit: 10 }, participationNotificationLevel: 'membership'
    } });
    const update = User.collection.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set).toMatchObject({
      'settings.rideDefaults.participantLimit': 10,
      'settings.participationNotificationLevel': 'membership'
    });
    expect(update.$set.settings).toBeUndefined();
    expect(update.$set['settings.rideDefaults']).toBeUndefined();
  });
});
