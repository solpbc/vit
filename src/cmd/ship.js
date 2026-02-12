// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Agent } from '@atproto/api';
import { TID } from '@atproto/common-web';
import { loadConfig } from '../lib/config.js';
import { createOAuthClient, createSessionStore } from '../lib/oauth.js';
import { appendLog } from '../lib/vit-dir.js';

export default function register(program) {
  program
    .command('ship <text>')
    .description('Write a cap to the authenticated PDS')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .action(async (text, opts) => {
      try {
        const { verbose } = opts;
        const envDid = loadConfig().did;
        const did = opts.did || envDid;
        if (verbose) console.log(`[verbose] Config loaded, DID: ${did}`);

        const clientId = `http://localhost?redirect_uri=${encodeURIComponent('http://127.0.0.1')}&scope=${encodeURIComponent('atproto transition:generic')}`;
        const sessionStore = createSessionStore();
        const client = createOAuthClient({
          clientId,
          sessionStore,
          stateStore: {
            set: async () => {},
            get: async () => undefined,
            del: async () => {},
          },
          redirectUri: 'http://127.0.0.1',
        });
        const session = await client.restore(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);
        const agent = new Agent(session);

        const record = {
          $type: 'org.v-it.cap',
          text,
          createdAt: new Date().toISOString(),
        };
        const rkey = TID.nextStr();
        if (verbose) console.log(`[verbose] Record built, rkey: ${rkey}`);
        const putArgs = {
          repo: did,
          collection: 'org.v-it.cap',
          rkey,
          record,
          validate: false,
        };
        if (verbose) console.log(`[verbose] putRecord ${putArgs.collection} rkey=${rkey}`);
        const putRes = await agent.com.atproto.repo.putRecord(putArgs);
        try {
          appendLog('caps.jsonl', {
            ts: new Date().toISOString(),
            did,
            rkey,
            collection: 'org.v-it.cap',
            pds: session.serverMetadata?.issuer,
            uri: putRes.data.uri,
            cid: putRes.data.cid,
          });
        } catch (logErr) {
          console.error('warning: failed to write caps.jsonl:', logErr.message);
        }
        if (verbose) console.log(`[verbose] Log written to caps.jsonl`);
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            pds: session.serverMetadata?.issuer,
            xrpc: 'com.atproto.repo.putRecord',
            request: putArgs,
            response: putRes.data,
          }),
        );
      } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
      }
    });
}
