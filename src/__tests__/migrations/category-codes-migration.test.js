/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { migrateCategoryToCodes } from '../../migrations/migrations/002_category_codes.js';

function createMockDb(initialRides) {
  const state = initialRides.map(ride => ({ ...ride }));

  const collection = {
    find: jest.fn((query = {}) => {
      let filtered = state;
      if (query._id && query._id.$gt !== undefined) {
        filtered = filtered.filter(ride => ride._id > query._id.$gt);
      }

      return {
        sort: jest.fn(() => ({
          limit: jest.fn((size) => ({
            toArray: jest.fn(async () => filtered.sort((a, b) => a._id - b._id).slice(0, size))
          }))
        }))
      };
    }),
    bulkWrite: jest.fn(async (ops) => {
      for (const op of ops) {
        const target = state.find(ride => ride._id === op.updateOne.filter._id);
        if (target) {
          Object.assign(target, op.updateOne.update.$set);
        }
      }
      return { modifiedCount: ops.length };
    })
  };

  return {
    collection: jest.fn(() => collection),
    _state: state,
    _collection: collection
  };
}

describe('002_category_codes migration', () => {
  it('should normalize fixed legacy labels and canonical values to supported canonical codes', async () => {
    const db = createMockDb([
      { _id: 1, category: 'Regular/Mixed Ride' },
      { _id: 2, category: 'Road Ride' },
      { _id: 3, category: 'Gravel Ride' },
      { _id: 4, category: 'Mountain/Enduro/Downhill Ride' },
      { _id: 5, category: 'MTB-XC Ride' },
      { _id: 6, category: 'E-Bike Ride' },
      { _id: 7, category: 'Virtual/Indoor Ride' },
      { _id: 8, category: 'road' },
      { _id: 9, category: '' },
      { _id: 10 }
    ]);

    await migrateCategoryToCodes(db);

    expect(db._state.find(r => r._id === 1).category).toBe('mixed');
    expect(db._state.find(r => r._id === 2).category).toBe('road');
    expect(db._state.find(r => r._id === 3).category).toBe('gravel');
    expect(db._state.find(r => r._id === 4).category).toBe('mtb');
    expect(db._state.find(r => r._id === 5).category).toBe('mtb-xc');
    expect(db._state.find(r => r._id === 6).category).toBe('e-bike');
    expect(db._state.find(r => r._id === 7).category).toBe('virtual');
    expect(db._state.find(r => r._id === 8).category).toBe('road');
    expect(db._state.find(r => r._id === 9).category).toBe('mixed');
    expect(db._state.find(r => r._id === 10).category).toBe('mixed');
    expect(db._collection.bulkWrite).toHaveBeenCalled();
  });

  it('should not update records already using canonical category codes', async () => {
    const db = createMockDb([
      { _id: 1, category: 'road' },
      { _id: 2, category: 'mixed' },
      { _id: 3, category: 'gravel' }
    ]);

    await migrateCategoryToCodes(db);

    expect(db._collection.bulkWrite).not.toHaveBeenCalled();
  });
});
