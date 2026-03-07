/**
 * Strava OAuth token persistence.
 *
 * Stores encrypted {accessToken, expiresAt, refreshToken} in the MongoDB `kv`
 * collection under the key "strava-tokens".  Maintains an in-memory cache so
 * MongoDB is only touched on cold start and after each token refresh (~6 h).
 *
 * Reuses the Mongoose connection established by MongoDBStorage — no separate
 * MongoClient is created.  Gracefully degrades (warns + returns null) when
 * MongoDB is not connected (e.g. dev mode with in-memory storage).
 *
 * Encryption: AES-256-GCM with a key derived from STRAVA_CLIENT_SECRET (SHA-256).
 */

import mongoose from 'mongoose';
import fetch from 'node-fetch';
import { config } from '../config.js';
import { encrypt, decrypt } from './encryption.js';

const KV_COLLECTION = 'kv';
const STRAVA_TOKENS_KEY = 'strava-tokens';

/** @type {{ accessToken: string, expiresAt: number, refreshToken: string }|null} */
let _cache = null;

/**
 * Returns the native Db from the active Mongoose connection.
 * @throws {Error} when Mongoose is not connected
 */
function getDb() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error('MongoDB not connected (readyState: ' + mongoose.connection?.readyState + ')');
  return db;
}

/**
 * Loads Strava tokens from the in-memory cache or MongoDB.
 * @returns {Promise<{accessToken: string, expiresAt: number, refreshToken: string}|null>}
 */
export async function loadStravaTokens() {
  if (_cache) return _cache;

  try {
    const doc = await getDb().collection(KV_COLLECTION).findOne({ _id: STRAVA_TOKENS_KEY });
    if (!doc?.encrypted) return null;
    const plaintext = decrypt(doc.encrypted, config.strava.clientSecret);
    _cache = JSON.parse(plaintext);
    return _cache;
  } catch (err) {
    console.warn('[StravaTokenStore] Failed to load tokens from MongoDB:', err.message);
    return null;
  }
}

/**
 * Encrypts and persists Strava tokens to MongoDB; updates the in-memory cache.
 * Failures are logged but not re-thrown — callers must not depend on persistence.
 * @param {{ accessToken: string, expiresAt: number, refreshToken: string }} tokens
 */
export async function saveStravaTokens(tokens) {
  _cache = tokens;

  try {
    const encrypted = encrypt(JSON.stringify(tokens), config.strava.clientSecret);
    await getDb().collection(KV_COLLECTION).updateOne(
      { _id: STRAVA_TOKENS_KEY },
      { $set: { encrypted, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[StravaTokenStore] Failed to save tokens to MongoDB:', err.message);
  }
}

/**
 * Returns a valid Strava access token, refreshing via OAuth if needed.
 *
 * Priority:
 *  1. In-memory / MongoDB cached access token (if not expiring within 5 min)
 *  2. OAuth token refresh using the stored refresh token (prefers DB, falls back to
 *     config.strava.refreshToken env var for first-run bootstrap)
 *
 * New tokens are persisted to MongoDB after a refresh so the updated refresh token
 * is never lost between restarts.
 *
 * @param {string} clientId      Strava app client_id
 * @param {string} clientSecret  Strava app client_secret
 * @returns {Promise<string>} A valid access token
 * @throws If no refresh token is available or the OAuth request fails
 */
export async function getStravaAccessToken(clientId, clientSecret) {
  const stored = await loadStravaTokens().catch(() => null);
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Use stored access token if still valid (with 5-minute buffer)
  if (stored?.accessToken && stored.expiresAt - nowSeconds > 300) {
    return stored.accessToken;
  }

  // Prefer DB refresh token (most recent); fall back to env var for bootstrap
  const refreshToken = stored?.refreshToken || config.strava.refreshToken;
  if (!refreshToken) throw new Error('No Strava refresh token available');

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!response.ok) throw new Error(`Strava token refresh failed: ${response.status} ${response.statusText}`);

  const data = await response.json();
  // Persist new tokens; fire-and-forget — errors already logged inside saveStravaTokens
  saveStravaTokens({
    accessToken: data.access_token,
    expiresAt: data.expires_at,
    refreshToken: data.refresh_token
  }).catch(() => {});

  return data.access_token;
}

/**
 * Clears the in-memory cache, forcing the next call to re-read from MongoDB.
 * Intended for use in tests and admin tooling.
 */
export function invalidateStravaTokenCache() {
  _cache = null;
}
