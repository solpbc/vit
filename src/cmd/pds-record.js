// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Agent } from '@atproto/api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../lib/env.js';
import { createOAuthClient, createSessionStore } from '../lib/oauth.js';

export default function register(program) {
  program
    .command('pds-record')
    .description('Write and read a custom org.v-it.hello record on the authenticated PDS')
    .option('-v, --verbose', 'Show full API responses')
    .option('--did <did>', 'DID to use (overrides .env)')
    .option('--message <msg>', 'Message to write', 'hello world')
    .action(async (opts) => {
      try {
        const env = loadEnv();
        const did = opts.did || env.BSKY_DID;

        if (!did) {
          throw new Error('No DID found. Run `vit oauth` first or pass --did <did>.');
        }

        let sessionData;
        const sessionFile = join(process.cwd(), 'bsky_session.json');
        try {
          sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));
        } catch {
          throw new Error('Session file not found. Run `vit oauth` first to authenticate.');
        }

        if (!sessionData[did]) {
          throw new Error(`No session found for ${did}. Run \`vit oauth\` first to authenticate.`);
        }

        if (opts.verbose) {
          console.log(`[verbose] Restoring session for ${did}`);
        }

        const sessionStore = createSessionStore();
        const client = createOAuthClient({
          stateStore: {
            set: async () => {},
            get: async () => undefined,
            del: async () => {},
          },
          sessionStore,
          redirectUri: 'http://127.0.0.1',
        });

        const session = await client.restore(did);
        const agent = new Agent(session);

        if (opts.verbose) {
          console.log('[verbose] Session restored, agent ready');
        }

        const record = {
          $type: 'org.v-it.hello',
          message: opts.message,
          createdAt: new Date().toISOString(),
        };

        if (opts.verbose) {
          console.log('[verbose] Writing record:');
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

        const getResult = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: 'org.v-it.hello',
          rkey: 'self',
        });

        if (opts.verbose) {
          console.log('[verbose] Read-back result:');
          console.log(JSON.stringify(getResult.data, null, 2));
        }

        console.log(`Record value: ${JSON.stringify(getResult.data.value)}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
