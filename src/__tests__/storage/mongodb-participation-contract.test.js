import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoDBStorage } from '../../storage/mongodb.js';

describe('Mongo participation query contract without a database', () => {
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
    const expression = mode === 'regular' ? set['participation.joined'] : set.participation.thinking;
    expect(expression.$concatArrays[1]).toEqual({
      $literal: [expect.objectContaining(profile)]
    });
  });
});
