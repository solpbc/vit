// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { writeFileSync } from 'node:fs';
import { loadConfig, saveConfig } from '../lib/config.js';
import { createOAuthClient, createSessionStore, createStore } from '../lib/oauth.js';

export default function register(program) {
  program
    .command('login')
    .description('Log in to Bluesky via browser-based OAuth')
    .argument('<handle>', 'Bluesky handle (e.g. alice.bsky.social)')
    .option('-v, --verbose', 'Show discovery details')
    .option('--output <file>', 'Save token JSON to file')
    .option('--reset', 'Force re-login even if credentials are valid')
    .action(async (handle, opts) => {
      const { verbose, output, reset } = opts;
      handle = handle.replace(/^@/, '');

      if (!reset) {
        const existing = loadConfig();
        if (existing.did && existing.access_token && existing.expires_at) {
          const expiresAt = new Date(existing.expires_at).getTime();
          if (expiresAt > Date.now() + 60_000) {
            console.log(`Already logged in as ${existing.did}`);
            console.log(`Token expires: ${existing.expires_at}`);
            return;
          }
        }
      }

      let server;
      let timeout;

      try {
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
        const sessionStore = createSessionStore();
        const client = createOAuthClient({ stateStore, sessionStore, redirectUri });

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
        const tokens = sessionData?.tokenSet ?? {};
        const outputData = {
          did: session.did,
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt: tokens.expires_at ?? null,
        };

        console.log(JSON.stringify(outputData, null, 2));

        if (output) {
          writeFileSync(output, `${JSON.stringify(outputData, null, 2)}\n`);
        }

        const config = loadConfig();
        config.did = session.did;
        config.access_token = tokens.access_token;
        config.refresh_token = tokens.refresh_token;
        config.expires_at = tokens.expires_at;
        saveConfig(config);
        console.log('\nCredentials saved to vit.json');
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }

        if (server) {
          server.stop(true);
        }
      }
    });
}
