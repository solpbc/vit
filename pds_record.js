#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { Agent } from '@atproto/api';
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';

const SESSION_FILE = new URL('bsky_session.json', import.meta.url).pathname;

function loadEnv() {
  const envPath = new URL('.env', import.meta.url).pathname;
  const vars = {};
  let content;
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    return vars;
  }
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

function createSessionStore() {
  let data = {};
  try {
    data = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
  } catch {}
  return {
    set: async (key, value) => {
      data[key] = value;
      writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2) + '\n');
    },
    get: async (key) => data[key],
    del: async (key) => { delete data[key]; },
  };
}

async function main() {
  const program = new Command();

  program
    .name('pds_record')
    .description('Write and read a custom org.v-it.hello record on the authenticated PDS')
    .option('-v, --verbose', 'Show full API responses')
    .option('--did <did>', 'DID to use (overrides .env)')
    .option('--message <msg>', 'Message to write', 'hello world')
    .parse();

  const opts = program.opts();

  try {
    const env = loadEnv();
    const did = opts.did || env.BSKY_DID;

    if (!did) {
      throw new Error('No DID found. Run bsky_oauth.js first or pass --did <did>.');
    }

    // Verify session file exists
    let sessionData;
    try {
      sessionData = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
    } catch {
      throw new Error('Session file not found. Run bsky_oauth.js first to authenticate.');
    }

    if (!sessionData[did]) {
      throw new Error(`No session found for ${did}. Run bsky_oauth.js first to authenticate.`);
    }

    if (opts.verbose) {
      console.log(`[verbose] Restoring session for ${did}`);
    }

    // Create OAuth client with file-backed session store
    const sessionStore = createSessionStore();

    // No-op lock: safe for single-process CLI, silences concurrent-refresh warning
    const requestLock = async (_name, fn) => await fn();

    const client = new NodeOAuthClient({
      requestLock,
      clientMetadata: {
        client_id: 'https://v-it.org/client-metadata.json',
        client_name: 'vit CLI',
        application_type: 'native',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        redirect_uris: ['http://127.0.0.1'],
        scope: 'atproto transition:generic',
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: true,
        client_uri: 'https://v-it.org',
      },
      stateStore: {
        set: async () => {},
        get: async () => undefined,
        del: async () => {},
      },
      sessionStore,
    });

    const session = await client.restore(did);
    const agent = new Agent(session);

    if (opts.verbose) {
      console.log(`[verbose] Session restored, agent ready`);
    }

    // Write record
    const record = {
      $type: 'org.v-it.hello',
      message: opts.message,
      createdAt: new Date().toISOString(),
    };

    if (opts.verbose) {
      console.log(`[verbose] Writing record:`);
      console.log(JSON.stringify(record, null, 2));
    }

    const putResult = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: 'org.v-it.hello',
      rkey: 'self',
      record,
      validate: false,
    });

    console.log(`Record written: ${putResult.data.uri}`);

    // Read it back
    const getResult = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: 'org.v-it.hello',
      rkey: 'self',
    });

    if (opts.verbose) {
      console.log(`[verbose] Read-back result:`);
      console.log(JSON.stringify(getResult.data, null, 2));
    }

    console.log(`Record value: ${JSON.stringify(getResult.data.value)}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

await main();
