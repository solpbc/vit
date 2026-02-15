// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig, saveConfig } from '../lib/config.js';
import { requireNotAgent } from '../lib/agent.js';

export default function register(program) {
  program
    .command('setup')
    .description('Initialize user-level vit setup')
    .action(async () => {
      try {
        const gate = requireNotAgent();
        if (!gate.ok) {
          console.error('vit setup must be run by a human. run it in your own terminal.');
          process.exitCode = 1;
          return;
        }

        const gitPath = Bun.which('git');
        const bunPath = Bun.which('bun');
        console.log(`git: ${gitPath ? 'found' : 'not found'}`);
        console.log(`bun: ${bunPath ? 'found' : 'not found'}`);
        if (!gitPath || !bunPath) {
          const missing = [!gitPath ? 'git' : null, !bunPath ? 'bun' : null].filter(Boolean).join(', ');
          console.error(`missing required tools: ${missing}`);
          process.exitCode = 1;
          return;
        }

        // skill installation
        const npxPath = Bun.which('npx');
        if (npxPath) {
          try {
            const result = Bun.spawnSync(
              ['npx', 'skills', 'add', 'https://github.com/solpbc/vit/tree/main/skills/vit', '-a', 'claude-code', '-y'],
              {
                stdout: 'pipe',
                stderr: 'pipe',
              }
            );
            if (result.exitCode === 0) {
              console.log('skill: installed (using-vit)');
            } else {
              const errText = result.stderr.toString().trim();
              console.log(`skill: failed (${errText || 'unknown error'})`);
            }
          } catch {
            console.log('skill: failed (could not run npx skills)');
          }
        } else {
          console.log('skill: skipped (npx not found)');
        }

        const config = loadConfig();
        if (config.did) {
          console.log(`login: ${config.did}`);
        } else {
          console.log('login: not logged in');
          console.log("next: run 'vit login <handle>' to authenticate with Bluesky");
        }

        if (!config.setup_at) {
          config.setup_at = Math.floor(Date.now() / 1000);
          saveConfig(config);
        }

        if (config.did) {
          console.log('vit setup complete');
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
