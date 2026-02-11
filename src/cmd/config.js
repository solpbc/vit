// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig, saveConfig, getScalars } from '../lib/config.js';

function coerceValue(str) {
  if (str === 'true') return true;
  if (str === 'false') return false;
  const n = Number(str);
  if (str !== '' && !isNaN(n)) return n;
  return str;
}

export default function register(program) {
  program
    .command('config')
    .description('Read and write vit.json configuration')
    .argument('[action]', 'list (default), set, or delete')
    .argument('[key]', 'configuration key')
    .argument('[value]', 'value to set')
    .action(async (action, key, value) => {
      try {
        // Default to list when no action given
        if (!action || action === 'list') {
          const config = loadConfig();
          for (const [k, v] of getScalars(config)) {
            console.log(`${k}=${v}`);
          }
          return;
        }

        if (action === 'set') {
          if (!key || value === undefined) {
            console.error('Usage: vit config set <key> <value>');
            process.exitCode = 1;
            return;
          }
          const config = loadConfig();
          config[key] = coerceValue(value);
          saveConfig(config);
          return;
        }

        if (action === 'delete') {
          if (!key) {
            console.error('Usage: vit config delete <key>');
            process.exitCode = 1;
            return;
          }
          const config = loadConfig();
          delete config[key];
          saveConfig(config);
          return;
        }

        console.error(`Unknown action: ${action}`);
        process.exitCode = 1;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
