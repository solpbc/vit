// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { readProjectConfig } from '../lib/vit-dir.js';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mark, name } from '../lib/brand.js';
import { which } from '../lib/compat.js';
import { jsonOk, jsonError } from '../lib/json-output.js';

function scanSkillDir(dir) {
  const skills = [];
  if (!existsSync(dir)) return skills;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillMd)) {
        let version = null;
        try {
          const content = readFileSync(skillMd, 'utf-8');
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (match) {
            const versionMatch = match[1].match(/^version:\s*(.+)$/m);
            if (versionMatch) version = versionMatch[1].trim();
          }
        } catch { /* ignore read errors */ }
        skills.push({ name: entry.name, version });
      }
    }
  } catch { /* ignore dir read errors */ }
  return skills;
}

export default function register(program) {
  async function checkHealth(opts) {
    try {
      const config = loadConfig();
      const setup = {
        done: !!config.setup_at,
        at: config.setup_at ? new Date(config.setup_at * 1000).toISOString() : null,
      };
      let installType = 'not on PATH';
      let vitPath = which(name);
      let installPath = vitPath || null;
      let beacon = null;
      let skillInstalled = false;
      let projectSkills = [];
      let userSkills = [];
      let blueskyOk = false;
      let pds = null;

      if (config.setup_at) {
        const when = new Date(config.setup_at * 1000).toISOString();
        if (!opts.json) console.log(`${mark} setup: ok (${when})`);
      } else {
        if (!opts.json) console.log(`${mark} setup: not done (run ${name} setup)`);
      }

      if (!vitPath) {
        installType = 'not on PATH';
        if (!opts.json) console.log(`${mark} install: not on PATH`);
      } else {
        try {
          if (lstatSync(vitPath).isSymbolicLink()) {
            installType = 'linked';
            if (!opts.json) console.log(`${mark} install: linked (${vitPath})`);
          } else if (vitPath.includes('node_modules')) {
            installType = 'global';
            if (!opts.json) console.log(`${mark} install: global`);
          } else {
            installType = 'source';
            if (!opts.json) console.log(`${mark} install: source (${vitPath})`);
          }
        } catch {
          installType = 'source';
          if (!opts.json) console.log(`${mark} install: source (${vitPath})`);
        }
      }

      const projConfig = readProjectConfig();
      beacon = projConfig.beacon || null;
      if (projConfig.beacon) {
        if (!opts.json) console.log(`${mark} beacon: ${projConfig.beacon}`);
      } else {
        if (!opts.json) console.log(`${mark} beacon: not set`);
      }

      const skillPath = join(process.cwd(), '.claude', 'skills', 'using-vit', 'SKILL.md');
      skillInstalled = existsSync(skillPath);
      if (existsSync(skillPath)) {
        if (!opts.json) console.log(`${mark} skill: ok (using-vit)`);
      } else {
        if (!opts.json) console.log(`${mark} skill: not installed (run ${name} setup)`);
      }

      // Report installed skills
      const projectSkillDir = join(process.cwd(), '.claude', 'skills');
      projectSkills = scanSkillDir(projectSkillDir);
      const userSkillDir = join(homedir(), '.claude', 'skills');
      userSkills = scanSkillDir(userSkillDir);

      if (!opts.json && projectSkills.length > 0) {
        console.log(`${mark} project skills: ${projectSkills.length} installed`);
        for (const s of projectSkills) {
          const ver = s.version ? ` v${s.version}` : '';
          console.log(`    ${s.name}${ver}`);
        }
      }
      if (!opts.json && userSkills.length > 0) {
        console.log(`${mark} user skills: ${userSkills.length} installed`);
        for (const s of userSkills) {
          const ver = s.version ? ` v${s.version}` : '';
          console.log(`    ${s.name}${ver}`);
        }
      }

      if (!config.did) {
        if (!opts.json) console.log(`${mark} bluesky: not logged in (run ${name} login <handle>)`);
      } else {
        try {
          const { session } = await restoreAgent(config.did);
          blueskyOk = true;
          pds = session.serverMetadata?.issuer || null;
          if (!opts.json) console.log(`${mark} bluesky: ok (${session.did}${pds ? ', ' + pds : ''})`);
        } catch {
          if (!opts.json) console.log(`${mark} bluesky: token expired or invalid (run ${name} login <handle>)`);
        }
      }

      if (opts.json) {
        jsonOk({
          setup,
          install: { type: installType, path: installPath },
          beacon,
          skill: skillInstalled,
          projectSkills,
          userSkills,
          bluesky: { ok: blueskyOk, did: config.did || null, pds },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        jsonError(msg);
        return;
      }
      console.error(msg);
      process.exitCode = 1;
    }
  }

  program.command('doctor')
    .description('Verify vit environment and project configuration')
    .option('--json', 'Output as JSON')
    .action(checkHealth);
  program.command('status')
    .description('Alias for doctor')
    .option('--json', 'Output as JSON')
    .action(checkHealth);
}
