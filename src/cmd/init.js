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
    .option('--beacon <url>', 'Git URL (or "." to read from git remote origin) to derive the beacon URI')
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
          } else if (existsSync(dir)) {
            console.log('beacon: not set');
          } else {
            console.log('.vit directory not found');
          }
          return;
        }

        let gitUrl = opts.beacon;
        if (gitUrl === '.') {
          try {
            gitUrl = execSync('git config --get remote.origin.url', {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            if (verbose) console.log(`[verbose] Read git remote origin: ${gitUrl}`);
          } catch {
            console.error('No git remote origin found. Set a remote or provide a git URL directly.');
            process.exitCode = 1;
            return;
          }
          if (!gitUrl) {
            console.error('No git remote origin found. Set a remote or provide a git URL directly.');
            process.exitCode = 1;
            return;
          }
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
