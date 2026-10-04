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
    expect(expression.$concatArrays[1][0].$let.in.$mergeObjects[0]).toEqual({
      $literal: expect.objectContaining(profile)
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

  it('selects groups with current lifecycle, membership, and group-existence guards', async () => {
    await storage.setPaceGroup(String(ride._id), 2, 'B');
    const [filter, pipeline] = Ride.collection.findOneAndUpdate.mock.calls[0];
    expect(filter.cancelled).toEqual({ $ne: true });
    expect(filter.date.$gt).toBeInstanceOf(Date);
    expect(filter.$expr.$in[0]).toEqual({ $literal: 'B' });
    expect(filter.$or).toEqual(['joined', 'thinking'].map(state => ({
      [`participation.${state}`]: { $elemMatch: { userId: 2, paceGroup: { $ne: 'B' } } }
    })));
    expect(Object.keys(pipeline[0].$set)).toEqual(['participation.joined', 'participation.thinking']);
    expect(JSON.stringify(pipeline)).not.toContain('createdAt');
  });

  it('cleans removed choices in the same update using current arrays, with literal content', async () => {
    await storage.updateRide(String(ride._id), { cruisingSpeedGroups: [{ min: 30, max: 30 }, { min: 20, max: 20 }], title: '$participation' });
    const pipeline = Ride.collection.findOneAndUpdate.mock.calls[0][1];
    expect(pipeline[0].$set.title).toEqual({ $literal: '$participation' });
    expect(pipeline[0].$set.cruisingSpeedMin).toEqual({ $literal: null });
    expect(pipeline[1].$set['participation.joined'].$map.input).toEqual({ $ifNull: ['$participation.joined', []] });
    expect(pipeline[1].$set['participation.thinking'].$map.input).toEqual({ $ifNull: ['$participation.thinking', []] });
  });

  it('still casts and validates all supplied fields when speed cleanup uses a pipeline', async () => {
    await expect(storage.updateRide(String(ride._id), { speedGroups: [], title: '' })).rejects.toThrow();
    await expect(storage.updateRide(String(ride._id), { speedGroups: [], settings: { participantLimit: 2000 } })).rejects.toThrow();
    expect(Ride.collection.findOneAndUpdate).not.toHaveBeenCalled();
    await storage.updateRide(String(ride._id), { speedGroups: [], date: '2099-01-01T10:00:00Z' });
    expect(Ride.collection.findOneAndUpdate.mock.calls[0][1][0].$set.date.$literal).toEqual(new Date('2099-01-01T10:00:00Z'));
  });

  it('round trips optional group fields through Mongoose schema and interface mapping', () => {
    const document = new Ride({ ...ride, cruisingSpeedGroups: [{ min: 25, max: 30 }, { min: 20, max: null }],
      participation: { joined: [{ ...profile, paceGroup: 'B' }], thinking: [], skipped: [] } });
    expect(document.validateSync()).toBeUndefined();
    const mapped = storage.mapRideToInterface(document);
    expect(mapped.cruisingSpeedGroups).toEqual([{ min: 25, max: 30 }, { min: 20, max: null }]);
    expect(mapped.participation.joined[0].paceGroup).toBe('B');
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
  it('selects start points with current lifecycle, membership and point-existence guards', async () => {
    await storage.setStartPoint(String(ride._id), 2, 'S2');
    const [filter, pipeline] = Ride.collection.findOneAndUpdate.mock.calls[0];
    expect(filter.cancelled).toEqual({ $ne: true });
    expect(filter.date.$gt).toBeInstanceOf(Date);
    expect(filter.$expr.$in[0]).toEqual({ $literal: 'S2' });
    expect(filter.$or).toEqual(['joined', 'thinking'].map(state => ({
      [`participation.${state}`]: { $elemMatch: { userId: 2, startPoint: { $ne: 'S2' } } }
    })));
    expect(JSON.stringify(filter.$expr)).toContain('$meetingPoints');
    expect(pipeline[0].$set['participation.joined'].$map.in.$cond[1].$mergeObjects[1])
      .toEqual({ startPoint: { $literal: 'S2' } });
  });

  it('cleans deleted start choices atomically and treats meeting contents as literals', async () => {
    await storage.updateRide(String(ride._id), { meetingPoint: 'S9: $title\nS1: Square' });
    const pipeline = Ride.collection.findOneAndUpdate.mock.calls[0][1];
    expect(pipeline[0].$set.meetingPoints).toEqual({ $literal: ['Square', '$title'] });
    expect(JSON.stringify(pipeline[2])).toContain('startPoint');
    expect(pipeline[2].$set['participation.joined'].$map.input)
      .toEqual({ $ifNull: ['$participation.joined', []] });
    await expect(storage.updateRide(String(ride._id), { meetingPoints: Array(6).fill('Park') })).rejects.toThrow();
  });

  it('preserves current start selection in participation transitions but clears it on skipping', async () => {
    await storage.setParticipation(String(ride._id), 'joined', profile);
    const pipeline = Ride.collection.findOneAndUpdate.mock.calls[0][1];
    const selection = pipeline[0].$set['participation.joined'].$concatArrays[1][0].$let.in.$mergeObjects[2];
    expect(selection.$cond[1]).toEqual({ startPoint: '$$current.startPoint' });
    Ride.collection.findOneAndUpdate.mockClear();
    await storage.setParticipation(String(ride._id), 'skipped', profile);
    const skipped = Ride.collection.findOneAndUpdate.mock.calls[0][1][0].$set['participation.skipped'].$concatArrays[1][0];
    expect(skipped.$literal.startPoint).toBeUndefined();
  });

  it('round trips points and selected labels through the schema and interface', async () => {
    const document = new Ride({ ...ride, meetingPoints: ['Park', 'Square'],
      participation: { joined: [{ ...profile, startPoint: 'S2' }], thinking: [], skipped: [] } });
    await expect(document.validate()).resolves.toBeUndefined();
    const mapped = storage.mapRideToInterface(document);
    expect(mapped.meetingPoints).toEqual(['Park', 'Square']);
    expect(mapped.participation.joined[0].startPoint).toBe('S2');
  });

});
