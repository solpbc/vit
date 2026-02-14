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
          console.error(`vit setup cannot run inside ${gate.name} (detected ${gate.envVar}=1).`);
          console.error('run vit setup from your own terminal instead.');
          process.exitCode = 1;
          return;
        }

        const config = loadConfig();
        if (config.setup_at) {
          const when = new Date(config.setup_at * 1000).toISOString();
          console.log(`vit already set up (setup_at: ${when})`);
          return;
        }
        config.setup_at = Math.floor(Date.now() / 1000);
        saveConfig(config);
        console.log('vit setup complete');
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
