// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { toBeacon } from '../lib/beacon.js';

export default function register(program) {
  program
    .command('init')
    .description('Initialize .vit directory and set project beacon. Use the most official upstream or well-known git URL so all contributors converge on the same beacon.')
    .option('--beacon <url>', 'Git URL (or "." to read from git remote origin) to derive the beacon URI')
    .action(async (opts) => {
      try {
        const vitDir = join(process.cwd(), '.vit');
        const beaconPath = join(vitDir, 'beacon');

        if (!opts.beacon) {
          // No --beacon flag: report status
          if (existsSync(beaconPath)) {
            const uri = readFileSync(beaconPath, 'utf-8').trim();
            console.log(`beacon: ${uri}`);
          } else if (existsSync(vitDir)) {
            console.log('beacon: not set');
          } else {
            console.log('.vit directory not found');
          }
          return;
        }

        // Resolve git URL
        let gitUrl = opts.beacon;
        if (gitUrl === '.') {
          try {
            gitUrl = execSync('git config --get remote.origin.url', {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
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
        mkdirSync(vitDir, { recursive: true });
        writeFileSync(beaconPath, beacon + '\n');
        console.log(`beacon: ${beacon}`);
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
