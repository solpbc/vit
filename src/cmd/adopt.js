// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseGitUrl, toBeacon, beaconToHttps } from '../lib/beacon.js';
import { writeProjectConfig } from '../lib/vit-dir.js';
import { requireNotAgent } from '../lib/agent.js';

export default function register(program) {
  program
    .command('adopt')
    .argument('<beacon>', 'Beacon URI, git URL, or slug to adopt (e.g. vit:github.com/org/repo)')
    .argument('[name]', 'Local directory name (defaults to repo name)')
    .description('Fork or clone a project and initialize .vit/')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (beacon, name, opts) => {
      try {
        const gate = requireNotAgent();
        if (!gate.ok) {
          console.error(`vit adopt cannot run inside ${gate.name} (detected ${gate.envVar}=1).`);
          console.error('run vit adopt from your own terminal instead.');
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;

        // resolve beacon
        if (verbose) console.log(`[verbose] resolving beacon: ${beacon}`);
        const httpsUrl = beaconToHttps(beacon);
        const parsed = parseGitUrl(httpsUrl);
        const beaconUri = 'vit:' + toBeacon(httpsUrl);
        if (verbose) console.log(`[verbose] beacon: ${beaconUri}`);
        if (verbose) console.log(`[verbose] https: ${httpsUrl}`);

        // determine directory name
        const dirName = name || parsed.repo;
        const dirPath = resolve(dirName);
        if (verbose) console.log(`[verbose] target directory: ${dirPath}`);

        // fail fast if directory exists
        if (existsSync(dirPath)) {
          console.error(`Directory already exists: ${dirName}`);
          process.exitCode = 1;
          return;
        }

        // detect gh + github host
        const ghPath = Bun.which('gh');
        const isGitHub = parsed.host === 'github.com';
        if (verbose) console.log(`[verbose] gh available: ${ghPath ? 'yes' : 'no'}, github host: ${isGitHub ? 'yes' : 'no'}`);

        if (ghPath && isGitHub) {
          if (verbose) console.log(`[verbose] gh found at ${ghPath}, forking via gh`);
          try {
            execFileSync('gh', ['repo', 'fork', httpsUrl, '--clone', '--', dirName], {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch (err) {
            console.error(`Fork failed: ${(err.stderr || err.message || '').trim()}`);
            process.exitCode = 1;
            return;
          }
        } else {
          if (verbose) console.log(`[verbose] cloning via git`);
          try {
            execFileSync('git', ['clone', httpsUrl, dirName], {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch (err) {
            console.error(`Clone failed: ${(err.stderr || err.message || '').trim()}`);
            process.exitCode = 1;
            return;
          }
        }

        if (verbose) console.log(`[verbose] initializing .vit/`);

        // initialize .vit/ in the cloned directory
        writeProjectConfig({ beacon: beaconUri }, dirPath);
        if (verbose) console.log(`[verbose] wrote ${dirName}/.vit/config.json`);

        // success output
        console.log(`beacon: ${beaconUri}`);
        console.log(`directory: ${dirName}`);
        console.log(`run: cd ${dirName}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
