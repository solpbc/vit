// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { spawnSync } from 'node:child_process';
import { loadConfig, saveConfig } from '../lib/config.js';
import { requireNotAgent } from '../lib/agent.js';
import { which } from '../lib/compat.js';
import { mark, brand, name } from '../lib/brand.js';

export default function register(program) {
  program
    .command('setup')
    .description('Initialize user-level vit setup')
    .action(async () => {
      try {
        const gate = requireNotAgent();
        if (!gate.ok) {
          console.error(`${name} setup must be run by a human. run it in your own terminal.`);
          process.exitCode = 1;
          return;
        }

        const gitPath = which('git');
        console.log(`${mark} git: ${gitPath ? 'found' : 'not found'}`);
        if (!gitPath) {
          console.error('missing required tool: git');
          process.exitCode = 1;
          return;
        }

        // skill installation
        const npxPath = which('npx');
        if (npxPath) {
          try {
            const result = spawnSync(
              'npx', ['skills', 'add', 'https://github.com/solpbc/vit/tree/main/skills/vit', '-a', 'claude-code', '-y'],
              {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
              }
            );
            if (result.status === 0) {
              console.log(`${mark} skill: installed (using-vit)`);
            } else {
              const errText = (result.stderr || '').trim();
              console.log(`${mark} skill: failed (${errText || 'unknown error'})`);
            }
          } catch {
            console.log(`${mark} skill: failed (could not run npx skills)`);
          }
        } else {
          console.log(`${mark} skill: skipped (npx not found)`);
        }

        const config = loadConfig();
        if (config.did) {
          console.log(`${mark} login: ${config.did}`);
        } else {
          console.log(`${mark} login: not logged in`);
          console.log(`next: run '${name} login <handle>' to authenticate with Bluesky`);
        }

        if (!config.setup_at) {
          config.setup_at = Math.floor(Date.now() / 1000);
          saveConfig(config);
        }

        if (config.did) {
          console.log(`${brand} setup complete`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
