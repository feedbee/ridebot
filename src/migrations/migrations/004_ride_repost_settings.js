/**
 * Migration 004: Add ride repost permission settings defaults
 */

export async function migrateRideRepostSettings(db) {
  console.log('Starting migration: Add ride repost permission setting defaults');

  const [rideResult, userResult] = await Promise.all([
    db.collection('rides').updateMany(
      { 'settings.allowReposts': { $exists: false } },
      { $set: { 'settings.allowReposts': false } }
    ),
    db.collection('users').updateMany(
      {
        'settings.rideDefaults': { $exists: true },
        'settings.rideDefaults.allowReposts': { $exists: false }
      },
      { $set: { 'settings.rideDefaults.allowReposts': false } }
    )
  ]);

  console.log('Ride repost settings migration completed:');
  console.log(`- Rides updated: ${rideResult.modifiedCount || 0}`);
  console.log(`- Users updated: ${userResult.modifiedCount || 0}`);
}
