// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { loadConfig, saveConfig } from '../lib/config.js';
import { createOAuthClient, createSessionStore, createStore } from '../lib/oauth.js';

export default function register(program) {
  program
    .command('login')
    .description('Log in to Bluesky via browser-based OAuth')
    .argument('<handle>', 'Bluesky handle (e.g. alice.bsky.social)')
    .option('-v, --verbose', 'Show discovery details')
    .option('--reset', 'Force re-login even if credentials are valid')
    .option('--remote', 'Skip browser launch; prompt to paste callback URL (auto-detected over SSH)')
    .option('--browser <command>', 'Browser command to use (e.g. firefox)')
    .action(async (handle, opts) => {
      const { verbose, reset, remote, browser } = opts;
      const isRemote = remote || !!(process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT);
      handle = handle.replace(/^@/, '');

      if (!reset) {
        const existing = loadConfig();
        if (existing.did) {
          const session = await createSessionStore().get(existing.did);
          if (session) {
            console.log(`Already logged in as ${existing.did}`);
            return;
          }
        }
      }

      let server;
      let timeout;
      let rl;

      try {
        let resolveCallback;
        let callbackResolved = false;
        const callbackPromise = new Promise((resolve) => {
          resolveCallback = resolve;
        });

        server = createServer((req, res) => {
          const url = new URL(req.url, `http://127.0.0.1`);

          if (req.method === 'GET' && url.pathname === '/callback') {
            const params = new URLSearchParams(url.searchParams);

            if (!callbackResolved) {
              callbackResolved = true;
              resolveCallback(params);
            }

            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><html><body><h2>Authorization complete, you can close this tab.</h2></body></html>');
            return;
          }

          res.writeHead(404);
          res.end('Not found');
        });

        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        if (verbose) {
          console.log(`[verbose] Server started on port ${port}`);
        }

        const redirectUri = `http://127.0.0.1:${port}/callback`;

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

        if (isRemote) {
          console.log("You're on a remote system. Open this URL in your local browser:");
          console.log(`  ${authUrl.toString()}\n`);
        } else {
          const platform = process.platform;
          const cmd = browser || (platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open');
          const browserArgs = !browser && platform === 'win32' ? ['/c', 'start', authUrl.toString()] : [authUrl.toString()];

          try {
            const child = spawn(cmd, browserArgs, { stdio: 'ignore', detached: true });
            child.unref();
          } catch {
            // Ignore browser-open failures and rely on printed URL.
          }

          console.log(`Open this URL in your browser:\n  ${authUrl.toString()}\n`);
        }

        if (isRemote) {
          rl = createInterface({ input: process.stdin, output: process.stdout });
          rl.question('Paste the callback URL from your browser: ', (line) => {
            try {
              const url = new URL(line.trim());
              const params = new URLSearchParams(url.searchParams);
              if (!callbackResolved) {
                callbackResolved = true;
                resolveCallback(params);
              }
            } catch {
              console.error('Invalid URL. Please paste the full callback URL.');
            }
          });
        }

        const timeoutMs = 5 * 60 * 1000;
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for callback.'));
          }, timeoutMs);
        });

        const params = await Promise.race([callbackPromise, timeoutPromise]);

        clearTimeout(timeout);
        timeout = undefined;
        server.closeAllConnections?.();
        server.close();
        if (rl) {
          rl.close();
        }

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

        console.log('Exchanging token...');
        const { session } = await client.callback(params);

        if (verbose) {
          console.log(`[verbose] Token exchange result for DID: ${session.did}`);
        }

        const config = loadConfig();
        config.did = session.did;
        saveConfig(config);
        console.log(`Logged in as ${session.did}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }

        if (rl) {
          rl.close();
        }

        if (server?.listening) {
          server.closeAllConnections?.();
          server.close();
        }
      }
    });
}
