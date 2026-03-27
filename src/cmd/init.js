// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { toBeacon } from '../lib/beacon.js';
import { vitDir, readProjectConfig, writeProjectConfig } from '../lib/vit-dir.js';
import { requireAgent } from '../lib/agent.js';
import { mark, name, DOT_VIT_README } from '../lib/brand.js';
import { jsonOk, jsonError } from '../lib/json-output.js';

export default function register(program) {
  program
    .command('init')
    .description('Initialize .vit directory and set project beacon. Use the most official upstream or well-known git URL so all contributors converge on the same beacon.')
    .option('--beacon <url>', 'Git URL (or "." to read from git remote upstream/origin) to derive the beacon URI')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          if (opts.json) {
            jsonError('agent required', 'run vit init from a coding agent');
            return;
          }
          console.error(`${name} init should be run by a coding agent (e.g. claude code, gemini cli).`);
          console.error(`open your agent and ask it to run '${name} init' for you.`);
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;
        const dir = vitDir();
        if (verbose) vlog(`[verbose] .vit dir: ${dir}`);

        if (!opts.beacon) {
          const config = readProjectConfig();
          if (config.beacon) {
            if (opts.json) {
              jsonOk({ beacon: config.beacon });
              return;
            }
            console.log(`${mark} beacon: ${config.beacon}`);
            console.log(`hint: to change the beacon, run: ${name} init --beacon <git-url>`);
            return;
          }

          let isGitRepo = false;
          try {
            execSync('git rev-parse --is-inside-work-tree', {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            isGitRepo = true;
          } catch {}
          if (verbose) vlog(`[verbose] in git repo: ${isGitRepo ? 'yes' : 'no'}`);

          const hasVitDir = existsSync(dir);
          if (!isGitRepo) {
            let remotes = [];
            if (opts.json) {
              jsonOk({
                status: hasVitDir ? 'no beacon' : 'not initialized',
                git: false,
                remotes,
              });
              return;
            }
            console.log(hasVitDir ? 'status: no beacon' : 'status: not initialized');
            console.log('git: false');
            if (hasVitDir) {
              console.log(`hint: run: ${name} init --beacon <canonical-git-url>`);
            } else {
              console.log(`hint: run ${name} init from inside a git repository.`);
            }
            return;
          }

          console.log(hasVitDir ? 'status: no beacon' : 'status: not initialized');
          console.log('git: true');

          let remoteNames = [];
          try {
            remoteNames = execSync('git remote', {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            })
              .trim()
              .split('\n')
              .filter(Boolean);
          } catch {
            remoteNames = [];
          }
          if (verbose) vlog(`[verbose] remotes detected: ${remoteNames.length > 0 ? remoteNames.join(', ') : 'none'}`);

          const remotes = [];
          for (const name of remoteNames) {
            try {
              const url = execSync(`git config --get remote.${name}.url`, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
              }).trim();
              if (url) remotes.push({ name, url });
            } catch {}
          }
          if (verbose && remotes.length > 0) {
            vlog(`[verbose] remote urls: ${remotes.map(r => `${r.name}=${r.url}`).join(' ')}`);
          }

          if (opts.json) {
            jsonOk({
              status: hasVitDir ? 'no beacon' : 'not initialized',
              git: true,
              remotes: remotes.map(r => ({ name: r.name, url: r.url })),
            });
            return;
          }

          const remotesDisplay = remotes.length > 0
            ? remotes.map(remote => `${remote.name}=${remote.url}`).join(' ')
            : 'none';
          console.log(`remotes: ${remotesDisplay}`);

          const upstream = remotes.find(remote => remote.name === 'upstream');
          const origin = remotes.find(remote => remote.name === 'origin');
          if (upstream) {
            console.log('hint: detected upstream remote. upstream points to the canonical repo.');
            console.log(`hint: run: ${name} init --beacon ${upstream.url}`);
          } else if (origin) {
            console.log(`hint: run: ${name} init --beacon ${origin.url}`);
          } else {
            console.log(`hint: no git remotes found. run: ${name} init --beacon <canonical-git-url>`);
          }
          return;
        }

        let gitUrl = opts.beacon;
        if (gitUrl === '.') {
          if (verbose) vlog('[verbose] resolving --beacon . via remote.upstream.url then remote.origin.url');
          let usedRemote = '';
          try {
            gitUrl = execSync('git config --get remote.upstream.url', {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            if (gitUrl) usedRemote = 'upstream';
          } catch {
            gitUrl = '';
          }

          if (!gitUrl) {
            try {
              gitUrl = execSync('git config --get remote.origin.url', {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
              }).trim();
              if (gitUrl) usedRemote = 'origin';
            } catch {
              gitUrl = '';
            }
          }

          if (!gitUrl) {
            if (opts.json) {
              jsonError('no git remote found', 'set a remote or provide a git URL directly');
              return;
            }
            console.error('No git remote found. Set a remote or provide a git URL directly.');
            process.exitCode = 1;
            return;
          }
          if (verbose) vlog(`[verbose] Read git remote ${usedRemote}: ${gitUrl}`);
        }

        const beacon = 'vit:' + toBeacon(gitUrl);
        if (verbose) vlog(`[verbose] Computed beacon: ${beacon}`);
        writeProjectConfig({ beacon });
        if (verbose) vlog(`[verbose] Wrote config.json`);
        const readmePath = join(vitDir(), 'README.md');
        if (!existsSync(readmePath)) {
          writeFileSync(readmePath, DOT_VIT_README);
          if (verbose) vlog(`[verbose] Wrote .vit/README.md`);
        }
        if (opts.json) {
          jsonOk({ beacon });
          return;
        }
        console.log(`${mark} beacon: ${beacon}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          jsonError(msg);
          return;
        }
        console.error(msg);
        process.exitCode = 1;
      }
    });
}
