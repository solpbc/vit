// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { AtpAgent } from '@atproto/api';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig } from '../lib/config.js';
import { createOAuthClient, createSessionStore, createStore, checkSession } from '../lib/oauth.js';
import { configDir, configPath } from '../lib/paths.js';
import { vitDir } from '../lib/vit-dir.js';
import { errorMessage, formatError } from '../lib/error-format.js';

export const LOGIN_COMMON_ISSUES_FOOTER = `Common issues:
  - make sure the handle is correct and resolves on Bluesky
  - open the printed URL in your browser, approve vit, and wait for the callback to finish
  - if you're on a remote machine, rerun with 'vit login <handle> --remote' and paste the full callback URL
  - if you used an app password, create a fresh Bluesky app password and try again
  - check your DNS, firewall, or VPN settings if vit cannot reach Bluesky`;

function ensureGitignore(dir, entry) {
  const gitignorePath = join(dir, '.gitignore');
  let content = '';
  try { content = readFileSync(gitignorePath, 'utf-8'); } catch {}
  if (!content.split('\n').includes(entry)) {
    writeFileSync(gitignorePath, content + (content.endsWith('\n') ? '' : '\n') + entry + '\n');
  }
}

export function cancelLogin({
  server,
  rl,
  timer,
  clearTimer = clearTimeout,
  stderr = console.error,
  exit = process.exit,
  footer = LOGIN_COMMON_ISSUES_FOOTER,
}) {
  try {
    if (server?.listening) server.close();
  } catch {
    // Ignore cleanup failures during cancellation.
  }
  try {
    rl?.close();
  } catch {
    // Ignore cleanup failures during cancellation.
  }
  try {
    if (timer) clearTimer(timer);
  } catch {
    // Ignore cleanup failures during cancellation.
  }
  stderr('\nLogin cancelled.');
  stderr(footer);
  exit(130);
}

export function printLoginFailure(err, { verbose = false, includeFooter = false } = {}) {
  console.error(formatError(err, { verbose }));
  if (includeFooter) {
    console.error(LOGIN_COMMON_ISSUES_FOOTER);
  }
}

export default function register(program) {
  program
    .command('login')
    .description('Log in to Bluesky')
    .argument('<handle>', 'Bluesky handle (e.g. alice.bsky.social)')
    .option('-v, --verbose', 'Show discovery details')
    .option('--force', 'Force re-login, skip session validation')
    .option('--remote', 'Skip browser launch; prompt to paste callback URL (auto-detected over SSH)')
    .option('--browser <command>', 'Browser command to use (e.g. firefox)')
    .option('--app-password <password>', 'Authenticate with an app password (skips browser OAuth)')
    .option('--local', 'Store session in project .vit/ instead of global config')
    .action(async (handle, opts) => {
      const { verbose, force, remote, browser, appPassword, local: localLogin } = opts;
      const isRemote = remote || !!(process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT);
      handle = handle.replace(/^@/, '');

      if (localLogin) {
        const dir = vitDir();
        if (!existsSync(dir)) {
          console.error("no .vit directory found. run 'vit init' first.");
          process.exitCode = 1;
          return;
        }
      }

      if (!force) {
        if (localLogin) {
          const localPath = join(vitDir(), 'login.json');
          if (existsSync(localPath)) {
            try {
              const local = JSON.parse(readFileSync(localPath, 'utf-8'));
              if (local.did) {
                console.log('Checking local session...');
                const validDid = checkSession(local.did);
                if (validDid) {
                  console.log(`Already logged in locally as ${validDid}`);
                  return;
                }
              }
            } catch (err) {
              console.warn(`warning: failed to read ${localPath}: ${errorMessage(err)}`);
            }
          }
        } else {
          const existing = loadConfig();
          if (existing.did) {
            console.log('Checking session...');
            const validDid = checkSession(existing.did);
            if (validDid) {
              console.log(`Already logged in as ${validDid}`);
              return;
            }
          }
        }
      }

      if (appPassword) {
        try {
          const agent = new AtpAgent({ service: 'https://bsky.social' });
          if (verbose) console.log('[verbose] Authenticating with app password...');
          const res = await agent.login({ identifier: handle, password: appPassword });
          const { did, handle: resolvedHandle, accessJwt, refreshJwt } = res.data;
          const session = { accessJwt, refreshJwt, handle: resolvedHandle, did, active: true };

          if (localLogin) {
            const loginData = { did, handle: resolvedHandle, type: 'app-password', service: 'https://bsky.social', session };
            const dir = vitDir();
            writeFileSync(join(dir, 'login.json'), JSON.stringify(loginData, null, 2) + '\n');
            ensureGitignore(dir, 'login.json');
          } else {
            const sessionFile = configPath('session.json');
            let data = {};
            if (existsSync(sessionFile)) {
              try {
                data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
              } catch (err) {
                console.warn(`warning: failed to read ${sessionFile}: ${errorMessage(err)}`);
              }
            }
            data[did] = { type: 'app-password', service: 'https://bsky.social', session };
            mkdirSync(configDir, { recursive: true });
            writeFileSync(sessionFile, JSON.stringify(data, null, 2) + '\n');
            const config = loadConfig();
            config.did = did;
            saveConfig(config);
          }

          console.log(`Logged in as ${did}`);
        } catch (err) {
          printLoginFailure(err, { verbose: opts.verbose, includeFooter: true });
          process.exitCode = 1;
        }
        return;
      }

      let server;
      let timeout;
      let rl;
      let loginStage = 'preflight';
      let onSigint = () => {};

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

        onSigint = () => {
          process.off('SIGINT', onSigint);
          cancelLogin({ server, rl, timer: timeout });
        };
        process.once('SIGINT', onSigint);

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

        loginStage = 'authorize';
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

        loginStage = 'callback';
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
        loginStage = 'token';
        const { session } = await client.callback(params);

        if (verbose) {
          console.log(`[verbose] Token exchange result for DID: ${session.did}`);
        }

        if (localLogin) {
          const loginData = { did: session.did, handle, type: 'oauth' };
          const dir = vitDir();
          writeFileSync(join(dir, 'login.json'), JSON.stringify(loginData, null, 2) + '\n');
          ensureGitignore(dir, 'login.json');
        } else {
          const config = loadConfig();
          config.did = session.did;
          saveConfig(config);
        }
        console.log(`Logged in as ${session.did}`);
      } catch (err) {
        printLoginFailure(err, {
          verbose: opts.verbose,
          includeFooter: loginStage !== 'preflight',
        });
        process.exitCode = 1;
      } finally {
        process.removeListener('SIGINT', onSigint);
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
