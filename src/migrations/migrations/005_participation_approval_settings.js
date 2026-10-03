/**
 * Backfill the opt-in participation approval setting for rides and existing user defaults.
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
export async function migrateParticipationApprovalSettings(db) {
  const [rideResult, userResult] = await Promise.all([
    db.collection('rides').updateMany(
      { 'settings.requireParticipationApproval': { $exists: false } },
      { $set: { 'settings.requireParticipationApproval': false } }
    ),
    db.collection('users').updateMany(
      {
        'settings.rideDefaults': { $exists: true },
        'settings.rideDefaults.requireParticipationApproval': { $exists: false }
      },
      { $set: { 'settings.rideDefaults.requireParticipationApproval': false } }
    )
  ]);
  console.log(`Participation approval settings migrated: ${rideResult.modifiedCount || 0} rides, ${userResult.modifiedCount || 0} users`);
}
