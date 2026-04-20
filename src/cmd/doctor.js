// SPDX-License-Identifier: MIT
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
import { configPath } from '../lib/paths.js';
import { errorMessage, formatError } from '../lib/error-format.js';

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
        } catch (err) {
          console.warn(`warning: failed to read ${skillMd}: ${errorMessage(err)}`);
        }
        skills.push({ name: entry.name, version });
      }
    }
  } catch (err) {
    console.warn(`warning: failed to read skill directory ${dir}: ${errorMessage(err)}`);
  }
  return skills;
}

export default function register(program) {
  async function checkHealth(opts) {
    try {
      const config = loadConfig();
      let installType = 'not on PATH';
      let vitPath = which(name);
      let installPath = vitPath || null;
      let beacon = null;
      let skillInstalled = false;
      let projectSkills = [];
      let userSkills = [];
      let blueskyOk = false;
      let pds = null;

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
        } catch (err) {
          console.warn(`warning: failed to inspect install path ${vitPath}: ${errorMessage(err)}`);
          installType = 'source';
          if (!opts.json) console.log(`${mark} install: source (${vitPath})`);
        }
      }

      const projConfig = readProjectConfig();
      beacon = projConfig.beacon || null;
      if (projConfig.beacon) {
        if (!opts.json) console.log(`${mark} beacon: ${projConfig.beacon}`);
      } else {
        if (!opts.json) console.log(`${mark} beacon: not set (run vit init)`);
      }

      const projectSkillPath = join(process.cwd(), '.claude', 'skills', 'using-vit', 'SKILL.md');
      const userSkillPath = join(homedir(), '.claude', 'skills', 'using-vit', 'SKILL.md');
      skillInstalled = existsSync(projectSkillPath) || existsSync(userSkillPath);
      if (skillInstalled) {
        if (!opts.json) console.log(`${mark} skill: ok (using-vit)`);
      } else {
        if (!opts.json) console.log(`${mark} skill: not installed (reinstall vit)`);
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

      let effectiveDid = config.did;
      let identitySource = effectiveDid ? 'global' : null;
      let authType = 'oauth';

      const localLoginPath = join(process.cwd(), '.vit', 'login.json');
      try {
        if (existsSync(localLoginPath)) {
          const local = JSON.parse(readFileSync(localLoginPath, 'utf-8'));
          if (local.did) {
            effectiveDid = local.did;
            identitySource = 'local';
            authType = local.type || 'oauth';
          }
        }
      } catch (err) {
        console.warn(`warning: failed to read ${localLoginPath}: ${errorMessage(err)}`);
      }

      if (!identitySource && effectiveDid) identitySource = 'global';

      if (identitySource === 'global' && effectiveDid) {
        const sessionFile = configPath('session.json');
        try {
          if (existsSync(sessionFile)) {
            const raw = readFileSync(sessionFile, 'utf-8');
            const sessionData = JSON.parse(raw);
            if (sessionData[effectiveDid]?.type === 'app-password') authType = 'app-password';
          }
        } catch (err) {
          console.warn(`warning: failed to read ${sessionFile}: ${errorMessage(err)}`);
        }
      }

      if (!effectiveDid) {
        if (!opts.json) console.log(`${mark} bluesky: not logged in (run ${name} login <handle>)`);
      } else {
        try {
          const { session } = await restoreAgent(effectiveDid);
          blueskyOk = true;
          pds = session.serverMetadata?.issuer || null;
          if (!opts.json) console.log(`${mark} bluesky: ok (${session.did || effectiveDid}${pds ? ', ' + pds : ''})`);
        } catch (err) {
          console.warn(`warning: failed to validate Bluesky session: ${errorMessage(err)}`);
          if (!opts.json) console.log(`${mark} bluesky: token expired or invalid (run ${name} login <handle>)`);
        }
        if (!opts.json) console.log(`${mark} identity: ${identitySource} (${authType})`);
      }

      if (opts.json) {
        jsonOk({
          install: { type: installType, path: installPath },
          beacon,
          skill: skillInstalled,
          projectSkills,
          userSkills,
          bluesky: { ok: blueskyOk, did: effectiveDid || null, pds, source: identitySource, authType },
        });
      }
    } catch (err) {
      if (opts.json) {
        jsonError(err);
        return;
      }
      console.error(formatError(err, { verbose: false }));
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
