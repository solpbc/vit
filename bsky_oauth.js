#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';

function createStore() {
  const map = new Map();

  return {
    set: async (key, value) => {
      map.set(key, value);
    },
    get: async (key) => map.get(key),
    del: async (key) => {
      map.delete(key);
    },
  };
}

function saveToEnv(vars) {
  const envPath = new URL('.env', import.meta.url).pathname;
  let lines = [];
  try {
    lines = readFileSync(envPath, 'utf-8').split('\n');
  } catch {}
  // Strip trailing empty lines from parsed content
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const updated = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && m[1] in vars) {
      lines[i] = `${m[1]}=${vars[m[1]]}`;
      updated.add(m[1]);
    }
  }
  for (const [key, value] of Object.entries(vars)) {
    if (!updated.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }
  writeFileSync(envPath, lines.join('\n') + '\n');
}

async function main() {
  const program = new Command();

  program
    .name('bsky_oauth')
    .description('Obtain an ATProto OAuth access token via browser authorization')
    .option('--handle <handle>', 'Bluesky handle (e.g. alice.bsky.social)')
    .option('-v, --verbose', 'Show discovery details')
    .option('--output <file>', 'Save token JSON to file')
    .parse();

  const { handle, verbose, output } = program.opts();

  let server;
  let timeout;

  try {
    if (!handle) {
      throw new Error('Missing required --handle argument.');
    }

    let resolveCallback;
    let callbackResolved = false;
    const callbackPromise = new Promise((resolve) => {
      resolveCallback = resolve;
    });

    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        if (req.method === 'GET' && url.pathname === '/callback') {
          const params = new URLSearchParams(url.searchParams);

          if (!callbackResolved) {
            callbackResolved = true;
            resolveCallback(params);
          }

          return new Response(
            '<!doctype html><html><body><h2>Authorization complete, you can close this tab.</h2></body></html>',
            {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            },
          );
        }

        return new Response('Not found', { status: 404 });
      },
    });

    if (verbose) {
      console.log(`[verbose] Server started on port ${server.port}`);
    }

    const redirectUri = `http://127.0.0.1:${server.port}/callback`;

    if (verbose) {
      console.log(`[verbose] Redirect URI: ${redirectUri}`);
    }

    const stateStore = createStore();
    const sessionStore = createStore();

    const client = new NodeOAuthClient({
      clientMetadata: {
        client_id: 'https://v-it.org/client-metadata.json',
        client_name: 'vit CLI',
        application_type: 'native',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        redirect_uris: [redirectUri],
        scope: 'atproto transition:generic',
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: true,
        client_uri: 'https://v-it.org',
      },
      stateStore,
      sessionStore,
    });

    const authUrl = await client.authorize(handle, {
      scope: 'atproto transition:generic',
    });

    if (verbose) {
      console.log(`[verbose] Authorization URL: ${authUrl.toString()}`);
    }

    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = platform === 'win32' ? ['/c', 'start', authUrl.toString()] : [authUrl.toString()];

    try {
      Bun.spawn([cmd, ...args], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      // Ignore browser-open failures and rely on printed URL.
    }

    console.log(`Open this URL in your browser:\n  ${authUrl.toString()}\n`);

    const timeoutMs = 5 * 60 * 1000;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for callback.'));
      }, timeoutMs);
    });

    const params = await Promise.race([callbackPromise, timeoutPromise]);

    clearTimeout(timeout);
    timeout = undefined;

    if (verbose) {
      console.log(`[verbose] Callback received with params: ${params.toString()}`);
    }

    const oauthError = params.get('error');
    if (oauthError) {
      const description = params.get('error_description');
      if (description) {
        throw new Error(`OAuth error: ${oauthError} (${description})`);
      }
      throw new Error(`OAuth error: ${oauthError}`);
    }

    const { session } = await client.callback(params);

    if (verbose) {
      console.log(`[verbose] Token exchange result for DID: ${session.did}`);
    }

    console.log(`DID: ${session.did}`);

    const sessionData = await sessionStore.get(session.did);
    const outputData = {
      did: session.did,
      accessToken: sessionData?.tokenSet?.access_token ?? null,
      refreshToken: sessionData?.tokenSet?.refresh_token ?? null,
      expiresAt: sessionData?.tokenSet?.expires_at ?? null,
    };

    console.log(JSON.stringify(outputData, null, 2));

    if (output) {
      writeFileSync(output, `${JSON.stringify(outputData, null, 2)}\n`);
    }

    saveToEnv({
      BSKY_DID: outputData.did,
      BSKY_ACCESS_TOKEN: outputData.accessToken ?? '',
      BSKY_REFRESH_TOKEN: outputData.refreshToken ?? '',
      BSKY_EXPIRES_AT: outputData.expiresAt ?? '',
    });
    console.log('Saved credentials to .env');
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    if (server) {
      server.stop();
    }
  }
}

await main();
