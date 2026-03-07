#!/usr/bin/env node
/**
 * Strava token management script.
 *
 * Commands:
 *   set [--refresh-token=<token>]   Encrypt and store tokens in MongoDB.
 *                                   If --refresh-token is omitted, reads STRAVA_REFRESH_TOKEN from env.
 *
 *   get                             Load and decrypt tokens from MongoDB; print to stdout.
 *
 *   encrypt '<json>'                Encrypt an arbitrary JSON string (uses STRAVA_CLIENT_SECRET).
 *                                   Useful for manual setup or backup.
 *
 *   decrypt '<base64>'              Decrypt a base64 blob and print the JSON.
 *
 * Requirements (must be present in .env or environment):
 *   MONGODB_URI         — MongoDB connection string
 *   STRAVA_CLIENT_SECRET — used as the encryption key
 *
 * Usage examples:
 *   node scripts/strava-tokens.js set --refresh-token=abc123def456
 *   node scripts/strava-tokens.js get
 *   node scripts/strava-tokens.js encrypt '{"refreshToken":"abc","accessToken":"xyz","expiresAt":9999}'
 *   node scripts/strava-tokens.js decrypt 'Base64StringHere...'
 */

import dotenv from 'dotenv';
dotenv.config();

import { MongoClient } from 'mongodb';
import { encrypt, decrypt } from '../src/utils/encryption.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const KV_COLLECTION = 'kv';
const STRAVA_TOKENS_KEY = 'strava-tokens';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} is not set in environment / .env file`);
    process.exit(1);
  }
  return value;
}

// ─── MongoDB helpers ──────────────────────────────────────────────────────────

async function withKvCollection(fn) {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const col = client.db().collection(KV_COLLECTION);
    return await fn(col);
  } finally {
    await client.close();
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdSet(args) {
  requireEnv('MONGODB_URI');
  requireEnv('STRAVA_CLIENT_SECRET');

  // Parse --refresh-token=<value> from args, or fall back to env var
  const rtArg = args.find(a => a.startsWith('--refresh-token='));
  const refreshToken = rtArg
    ? rtArg.slice('--refresh-token='.length)
    : process.env.STRAVA_REFRESH_TOKEN;

  if (!refreshToken) {
    console.error('Error: provide --refresh-token=<token> or set STRAVA_REFRESH_TOKEN in env');
    process.exit(1);
  }

  const tokens = { refreshToken };
  const plaintext = JSON.stringify(tokens);
  const encrypted = encrypt(plaintext, CLIENT_SECRET);

  await withKvCollection(async (col) => {
    await col.updateOne(
      { _id: STRAVA_TOKENS_KEY },
      { $set: { encrypted, updatedAt: new Date() } },
      { upsert: true }
    );
  });

  console.log('✓ Tokens stored in MongoDB (encrypted).');
  console.log('  The bot will obtain a fresh access token on next Strava URL parse.');
}

async function cmdGet() {
  requireEnv('MONGODB_URI');
  requireEnv('STRAVA_CLIENT_SECRET');

  const result = await withKvCollection(async (col) => {
    return col.findOne({ _id: STRAVA_TOKENS_KEY });
  });

  if (!result?.encrypted) {
    console.log('No Strava tokens found in MongoDB.');
    console.log('Run:  node scripts/strava-tokens.js set --refresh-token=<your_token>');
    return;
  }

  let tokens;
  try {
    tokens = JSON.parse(decrypt(result.encrypted, CLIENT_SECRET));
  } catch {
    console.error('Error: failed to decrypt tokens — wrong STRAVA_CLIENT_SECRET?');
    process.exit(1);
  }

  console.log('Stored Strava tokens:');
  console.log(JSON.stringify(tokens, null, 2));
  if (result.updatedAt) {
    console.log(`Last updated: ${result.updatedAt.toISOString()}`);
  }
}

function cmdEncrypt(args) {
  requireEnv('STRAVA_CLIENT_SECRET');

  const input = args[0];
  if (!input) {
    console.error('Usage: strava-tokens.js encrypt \'<json>\'');
    process.exit(1);
  }

  // Validate JSON
  try {
    JSON.parse(input);
  } catch {
    console.error('Error: input is not valid JSON');
    process.exit(1);
  }

  const result = encrypt(input, CLIENT_SECRET);
  console.log(result);
}

function cmdDecrypt(args) {
  requireEnv('STRAVA_CLIENT_SECRET');

  const input = args[0];
  if (!input) {
    console.error('Usage: strava-tokens.js decrypt \'<base64>\'');
    process.exit(1);
  }

  let plaintext;
  try {
    plaintext = decrypt(input, CLIENT_SECRET);
  } catch {
    console.error('Error: decryption failed — wrong STRAVA_CLIENT_SECRET or corrupted data');
    process.exit(1);
  }

  // Pretty-print if it's JSON
  try {
    console.log(JSON.stringify(JSON.parse(plaintext), null, 2));
  } catch {
    console.log(plaintext);
  }
}

function printHelp() {
  console.log(`
Usage: node scripts/strava-tokens.js <command> [options]

Commands:
  set [--refresh-token=<token>]   Store refresh token in MongoDB (encrypted).
                                  Falls back to STRAVA_REFRESH_TOKEN env var.

  get                             Print decrypted tokens from MongoDB.

  encrypt '<json>'                Encrypt JSON string and print base64 result.

  decrypt '<base64>'              Decrypt base64 string and print JSON.

Required env vars (in .env or environment):
  STRAVA_CLIENT_SECRET            Used as the encryption key
  MONGODB_URI                     Required for 'set' and 'get' commands
`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'set':
    await cmdSet(rest);
    break;
  case 'get':
    await cmdGet();
    break;
  case 'encrypt':
    cmdEncrypt(rest);
    break;
  case 'decrypt':
    cmdDecrypt(rest);
    break;
  default:
    printHelp();
    if (command) process.exit(1);
}
