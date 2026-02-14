// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { toBeacon } from '../lib/beacon.js';
import { vitDir, readProjectConfig, writeProjectConfig } from '../lib/vit-dir.js';
import { requireAgent } from '../lib/agent.js';

export default function register(program) {
  program
    .command('init')
    .description('Initialize .vit directory and set project beacon. Use the most official upstream or well-known git URL so all contributors converge on the same beacon.')
    .option('--beacon <url>', 'Git URL (or "." to read from git remote upstream/origin) to derive the beacon URI')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          console.error('vit init should be run by a coding agent (e.g. claude code, gemini cli).');
          console.error("open your agent and ask it to run 'vit init' for you.");
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;
        const dir = vitDir();
        if (verbose) console.log(`[verbose] .vit dir: ${dir}`);

        if (!opts.beacon) {
          const config = readProjectConfig();
          if (config.beacon) {
            console.log(`beacon: ${config.beacon}`);
            console.log('hint: to change the beacon, run: vit init --beacon <git-url>');
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
          if (verbose) console.log(`[verbose] in git repo: ${isGitRepo ? 'yes' : 'no'}`);

          const hasVitDir = existsSync(dir);
          if (!isGitRepo) {
            console.log(hasVitDir ? 'status: no beacon' : 'status: not initialized');
            console.log('git: false');
            if (hasVitDir) {
              console.log('hint: run: vit init --beacon <canonical-git-url>');
            } else {
              console.log('hint: run vit init from inside a git repository.');
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
          if (verbose) console.log(`[verbose] remotes detected: ${remoteNames.length > 0 ? remoteNames.join(', ') : 'none'}`);

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
            console.log(`[verbose] remote urls: ${remotes.map(r => `${r.name}=${r.url}`).join(' ')}`);
          }

          const remotesDisplay = remotes.length > 0
            ? remotes.map(remote => `${remote.name}=${remote.url}`).join(' ')
            : 'none';
          console.log(`remotes: ${remotesDisplay}`);

          const upstream = remotes.find(remote => remote.name === 'upstream');
          const origin = remotes.find(remote => remote.name === 'origin');
          if (upstream) {
            console.log('hint: detected upstream remote. upstream points to the canonical repo.');
            console.log(`hint: run: vit init --beacon ${upstream.url}`);
          } else if (origin) {
            console.log(`hint: run: vit init --beacon ${origin.url}`);
          } else {
            console.log('hint: no git remotes found. run: vit init --beacon <canonical-git-url>');
          }
          return;
        }

        let gitUrl = opts.beacon;
        if (gitUrl === '.') {
          if (verbose) console.log('[verbose] resolving --beacon . via remote.upstream.url then remote.origin.url');
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
            console.error('No git remote found. Set a remote or provide a git URL directly.');
            process.exitCode = 1;
            return;
          }
          if (verbose) console.log(`[verbose] Read git remote ${usedRemote}: ${gitUrl}`);
        }

        const beacon = 'vit:' + toBeacon(gitUrl);
        if (verbose) console.log(`[verbose] Computed beacon: ${beacon}`);
        writeProjectConfig({ beacon });
        if (verbose) console.log(`[verbose] Wrote config.json`);
        console.log(`beacon: ${beacon}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
