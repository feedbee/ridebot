/**
 * Migration 002: Normalize ride categories to canonical codes
 *
 * Converts categories from fixed legacy labels to supported canonical category codes.
 */

import { normalizeCategory } from '../../utils/category-utils.js';

const LEGACY_TO_CANONICAL = Object.freeze({
  'regular/mixed ride': 'mixed',
  'road ride': 'road',
  'gravel ride': 'gravel',
  'mountain/enduro/downhill ride': 'mtb',
  'mtb-xc ride': 'mtb-xc',
  'e-bike ride': 'e-bike',
  'virtual/indoor ride': 'virtual'
});

function normalizeLegacyInput(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function migrateCategoryValue(value) {
  if (!value || String(value).trim() === '') {
    return 'mixed';
  }

  const directCanonical = normalizeCategory(value);
  if (String(value).trim().toLowerCase().replace(/\s+/g, ' ') === directCanonical) {
    return directCanonical;
  }

  const legacyNormalized = normalizeLegacyInput(value);
  if (Object.hasOwn(LEGACY_TO_CANONICAL, legacyNormalized)) {
    return LEGACY_TO_CANONICAL[legacyNormalized];
  }

  return 'mixed';
}

export async function migrateCategoryToCodes(db) {
  console.log('Starting migration: Normalize category values to canonical codes');

  const batchSize = 100;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let lastId = null;

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const rides = await db
      .collection('rides')
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();

    if (rides.length === 0) {
      break;
    }

    const bulkOps = [];

    for (const ride of rides) {
      const normalizedCategory = migrateCategoryValue(ride.category);
      if (ride.category !== normalizedCategory) {
        bulkOps.push({
          updateOne: {
            filter: { _id: ride._id },
            update: { $set: { category: normalizedCategory } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await db.collection('rides').bulkWrite(bulkOps);
      totalUpdated += bulkOps.length;
    }

    totalProcessed += rides.length;
    lastId = rides[rides.length - 1]._id;
  }

  console.log('Category migration completed:');
  console.log(`- Total rides processed: ${totalProcessed}`);
  console.log(`- Total rides updated: ${totalUpdated}`);
}
