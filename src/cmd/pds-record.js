// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Agent } from '@atproto/api';
import { loadConfig } from '../lib/config.js';
import { createOAuthClient, createSessionStore } from '../lib/oauth.js';
import { configPath } from '../lib/paths.js';

export default function register(program) {
  program
    .command('pds-record')
    .description('Write and read a custom org.v-it.hello record on the authenticated PDS')
    .option('--did <did>', 'DID to use (overrides saved credentials)')
    .option('--message <msg>', 'Message to write', 'hello world')
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const did = opts.did || config.did;

        if (!did) {
          throw new Error('No DID found. Run `vit login` first or pass --did <did>.');
        }

        const sessionStore = createSessionStore();
        const sessionData = await sessionStore.get(did);
        if (!sessionData) {
          throw new Error(
            `No session found for ${did} in ${configPath('bsky_session.json')}. Run \`vit login\` first to authenticate.`,
          );
        }

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
        const pds = (await session.getTokenInfo(false)).aud;

        const record = {
          $type: 'org.v-it.hello',
          message: opts.message,
          createdAt: new Date().toISOString(),
        };

        const putArgs = {
          repo: did,
          collection: 'org.v-it.hello',
          rkey: 'self',
          record,
          validate: false,
        };
        const putResult = await agent.com.atproto.repo.putRecord(putArgs);
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            pds,
            xrpc: 'com.atproto.repo.putRecord',
            request: putArgs,
            response: putResult.data,
          }),
        );

        const getArgs = {
          repo: did,
          collection: 'org.v-it.hello',
          rkey: 'self',
        };
        const getResult = await agent.com.atproto.repo.getRecord(getArgs);
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            pds,
            xrpc: 'com.atproto.repo.getRecord',
            request: getArgs,
            response: getResult.data,
          }),
        );
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
