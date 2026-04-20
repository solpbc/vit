// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { TID } from '@atproto/common-web';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CAP_COLLECTION, SKILL_COLLECTION } from '../lib/constants.js';
import { requireAgent } from '../lib/agent.js';
import { requireDid, loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readLog, readFollowing } from '../lib/vit-dir.js';
import { REF_PATTERN, resolveRef } from '../lib/cap-ref.js';
import { isValidSkillName, skillRefFromName } from '../lib/skill-ref.js';
import { name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';
import { jsonOk, jsonError } from '../lib/json-output.js';
import { toBeacon } from '../lib/beacon.js';
import { hashTo3Words } from '../lib/cap-ref.js';
import { formatError } from '../lib/error-format.js';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'be', 'has', 'have', 'had',
  'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'as', 'if', 'so',
]);

function slugifyTitle(title) {
  const words = title.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const significant = words.filter(w => !STOP_WORDS.has(w));
  const chosen = significant.length >= 3 ? significant.slice(0, 3) : words.slice(0, 3);
  return chosen.join('-');
}

function generateRef(title, existingRefs) {
  const base = slugifyTitle(title);
  if (base && base.split('-').length >= 3 && !existingRefs.has(base)) {
    return base;
  }
  // Fall back to hash-based 3-word ref (always valid, collision-resistant)
  const hashed = hashTo3Words(title);
  if (!existingRefs.has(hashed)) return hashed;
  // Hash of title + timestamp to break hash collision
  const hashed2 = hashTo3Words(title + Date.now());
  if (!existingRefs.has(hashed2)) return hashed2;
  return null;
}

function normalizeBeacon(input) {
  if (input.startsWith('vit:')) return input;
  return 'vit:' + toBeacon(input);
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: text };
  const raw = match[1];
  const frontmatter = {};
  let currentKey = null;
  let currentValue = '';
  let isMultiline = false;

  for (const line of raw.split('\n')) {
    if (isMultiline) {
      if (line.match(/^\S/) && line.includes(':')) {
        // New key — save accumulated value
        frontmatter[currentKey] = currentValue.trim();
        isMultiline = false;
      } else {
        currentValue += ' ' + line.trim();
        continue;
      }
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(>-?|[|][-+]?)?(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const indicator = kvMatch[2];
      const rest = kvMatch[3].trim();
      if (indicator && (indicator.startsWith('>') || indicator.startsWith('|'))) {
        // Multiline YAML
        currentValue = rest;
        isMultiline = true;
      } else {
        frontmatter[currentKey] = rest;
      }
    }
  }
  if (isMultiline && currentKey) {
    frontmatter[currentKey] = currentValue.trim();
  }

  return { frontmatter, body: text.slice(match[0].length) };
}

function gatherFiles(dir, base) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...gatherFiles(fullPath, base));
    } else if (entry.name !== 'SKILL.md') {
      const relPath = relative(base, fullPath);
      results.push({ path: relPath, fullPath });
    }
  }
  return results;
}

function guessMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    sh: 'application/x-shellscript',
    bash: 'application/x-shellscript',
    html: 'text/html',
    css: 'text/css',
    xml: 'application/xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

async function shipSkill(opts) {
  const gate = requireAgent();
  if (!gate.ok) {
    if (opts.json) {
      jsonError('agent required', 'run vit ship --skill from a coding agent');
      return;
    }
    console.error(`${name} ship --skill should be run by a coding agent (e.g. claude code, gemini cli).`);
    console.error(`open your agent and ask it to run '${name} ship --skill' for you.`);
    process.exitCode = 1;
    return;
  }

  const { verbose } = opts;
  const vlog = opts.json ? (...a) => console.error(...a) : console.log;
  const skillDir = opts.skill;

  // Validate skill directory
  let skillMdPath;
  try {
    skillMdPath = join(skillDir, 'SKILL.md');
    statSync(skillMdPath);
  } catch {
    if (opts.json) {
      jsonError(`no SKILL.md found in ${skillDir}`);
      return;
    }
    console.error(`error: no SKILL.md found in ${skillDir}`);
    process.exitCode = 1;
    return;
  }

  // Read SKILL.md verbatim
  const skillMdText = readFileSync(skillMdPath, 'utf-8');
  if (!skillMdText.trim()) {
    if (opts.json) {
      jsonError('SKILL.md is empty');
      return;
    }
    console.error('error: SKILL.md is empty');
    process.exitCode = 1;
    return;
  }

  // Parse frontmatter to extract fields
  const { frontmatter } = parseFrontmatter(skillMdText);

  const skillName = frontmatter.name;
  if (!skillName) {
    if (opts.json) {
      jsonError("SKILL.md frontmatter must include a 'name' field");
      return;
    }
    console.error('error: SKILL.md frontmatter must include a "name" field');
    process.exitCode = 1;
    return;
  }

  if (!isValidSkillName(skillName)) {
    if (opts.json) {
      jsonError('invalid skill name', 'lowercase letters, numbers, hyphens only');
      return;
    }
    console.error('error: skill name must be lowercase letters, numbers, hyphens only.');
    console.error('       no leading hyphen, no consecutive hyphens, max 64 chars.');
    console.error(`       got: "${skillName}"`);
    process.exitCode = 1;
    return;
  }

  const skillDescription = frontmatter.description;
  if (!skillDescription) {
    if (opts.json) {
      jsonError("SKILL.md frontmatter must include a 'description' field");
      return;
    }
    console.error('error: SKILL.md frontmatter must include a "description" field');
    process.exitCode = 1;
    return;
  }

  if (verbose) vlog(`[verbose] skill name: ${skillName}`);
  if (verbose) vlog(`[verbose] skill description: ${skillDescription.slice(0, 80)}...`);

  // DID
  if (opts.json && !(opts.did || loadConfig().did)) {
    jsonError('no DID configured', "run 'vit login <handle>' first");
    return;
  }
  const did = requireDid(opts);
  if (!did) return;
  if (verbose) vlog(`[verbose] DID: ${did}`);

  // Session
  let agent, session;
  try {
    ({ agent, session } = await restoreAgent(did));
  } catch {
    if (opts.json) {
      jsonError('session expired or invalid', "run 'vit login <handle>'");
      return;
    }
    console.error(`session expired or invalid. tell your operator to run '${name} login <handle>'.`);
    process.exitCode = 1;
    return;
  }
  if (verbose) vlog(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

  // Gather and upload resource files as blobs
  const resourceFiles = gatherFiles(skillDir, skillDir);
  const resources = [];
  for (const rf of resourceFiles) {
    if (verbose) vlog(`[verbose] uploading resource: ${rf.path}`);
    const data = readFileSync(rf.fullPath);
    const mimeType = guessMimeType(rf.path);
    try {
      const uploadRes = await agent.com.atproto.repo.uploadBlob(data, { encoding: mimeType });
      resources.push({
        path: rf.path,
        blob: uploadRes.data.blob,
        mimeType,
      });
    } catch (err) {
      if (opts.json) {
        jsonError(`failed to upload resource ${rf.path}: ${err.message}`);
        return;
      }
      console.error(`error: failed to upload resource ${rf.path}: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  // Build record
  const now = new Date().toISOString();
  const ref = skillRefFromName(skillName);
  const record = {
    $type: SKILL_COLLECTION,
    name: skillName,
    description: skillDescription,
    text: skillMdText,
    createdAt: now,
  };

  // Optional fields from frontmatter or CLI flags
  const version = opts.version || frontmatter.version;
  if (version) record.version = version;

  const license = opts.license || frontmatter.license;
  if (license) record.license = license;

  if (frontmatter.compatibility) record.compatibility = frontmatter.compatibility;

  if (resources.length > 0) record.resources = resources;

  if (opts.tags) {
    record.tags = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  const rkey = TID.nextStr();
  if (verbose) vlog(`[verbose] Record built, ref: ${ref}, rkey: ${rkey}`);

  const putArgs = {
    repo: did,
    collection: SKILL_COLLECTION,
    rkey,
    record,
    validate: false,
  };

  if (verbose) vlog(`[verbose] putRecord ${putArgs.collection} rkey=${rkey}`);
  const putRes = await agent.com.atproto.repo.putRecord(putArgs);

  try {
    appendLog('skills.jsonl', {
      ts: now,
      did,
      rkey,
      ref,
      name: skillName,
      collection: SKILL_COLLECTION,
      pds: session.serverMetadata?.issuer,
      uri: putRes.data.uri,
      cid: putRes.data.cid,
    });
  } catch (logErr) {
    console.error('warning: failed to write skills.jsonl:', logErr.message);
  }
  if (verbose) vlog(`[verbose] Log written to skills.jsonl`);

  if (opts.json) {
    jsonOk({ ref, uri: putRes.data.uri });
    return;
  }
  console.log(`shipped: ${ref}`);
  console.log(`uri: ${putRes.data.uri}`);
  if (verbose) {
    vlog(
      JSON.stringify({
        ts: now,
        pds: session.serverMetadata?.issuer,
        xrpc: 'com.atproto.repo.putRecord',
        request: putArgs,
        response: putRes.data,
      }),
    );
  }
}

async function shipCap(opts) {
  const gate = requireAgent();
  if (!gate.ok) {
    if (opts.json) {
      jsonError('agent required', 'run vit ship from a coding agent');
      return;
    }
    console.error(`${name} ship should be run by a coding agent (e.g. claude code, gemini cli).`);
    console.error(`open your agent and ask it to run '${name} ship' for you.`);
    console.error(`refer to the using-vit skill (skills/vit/SKILL.md) for a shipping guide.`);
    process.exitCode = 1;
    return;
  }

  const { verbose } = opts;
  const vlog = opts.json ? (...a) => console.error(...a) : console.log;

  // preflight: DID
  if (opts.json && !(opts.did || loadConfig().did)) {
    jsonError('no DID configured', "run 'vit login <handle>' first");
    return;
  }
  const did = requireDid(opts);
  if (!did) return;
  if (verbose) vlog(`[verbose] DID: ${did}`);

  // preflight: beacon
  const projectConfig = readProjectConfig();
  const isRequest = opts.kind === 'request';

  let beacon;
  if (isRequest) {
    // Request caps: --beacon flag or project config (in that order)
    if (opts.beacon) {
      try {
        beacon = normalizeBeacon(opts.beacon);
      } catch (err) {
        if (opts.json) {
          jsonError(`invalid --beacon: ${err.message}`);
          return;
        }
        console.error(`error: invalid --beacon: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    } else if (projectConfig.beacon) {
      beacon = projectConfig.beacon;
    } else {
      if (opts.json) {
        jsonError('request caps must be addressed to a project', 'use --beacon <github-url> or run from a vit-initialized directory');
        return;
      }
      console.error('error: request caps must be addressed to a project. use --beacon <github-url> or run from a vit-initialized directory.');
      process.exitCode = 1;
      return;
    }
  } else {
    if (!projectConfig.beacon) {
      if (opts.json) {
        jsonError('no beacon set', "run 'vit init' first");
        return;
      }
      console.error(`no beacon set. run '${name} init' in a project directory first.`);
      process.exitCode = 1;
      return;
    }
    beacon = projectConfig.beacon;
  }
  if (verbose) vlog(`[verbose] beacon: ${beacon}`);

  let text;
  try {
    text = readFileSync('/dev/stdin', 'utf-8').trim();
  } catch {
    text = '';
  }
  if (!text && !isRequest) {
    if (opts.json) {
      jsonError('cap body is required via stdin');
      return;
    }
    console.error('error: cap body is required via stdin (pipe or heredoc)');
    process.exitCode = 1;
    return;
  }

  // ref: required for non-request caps; auto-generated for request caps
  let ref = opts.ref;
  if (!ref && isRequest) {
    const caps = readLog('caps.jsonl');
    const existingRefs = new Set(caps.map(e => e.ref));
    ref = generateRef(opts.title || '', existingRefs);
    if (!ref) {
      if (opts.json) {
        jsonError('could not auto-generate ref from title', 'provide --ref explicitly');
        return;
      }
      console.error('error: could not auto-generate a 3-word ref from the title. provide --ref explicitly.');
      process.exitCode = 1;
      return;
    }
    if (verbose || !opts.json) {
      vlog(`ref: ${ref}`);
    }
  }

  if (!REF_PATTERN.test(ref)) {
    if (opts.json) {
      jsonError('--ref must be exactly three lowercase words separated by dashes');
      return;
    }
    console.error('error: --ref must be exactly three lowercase words separated by dashes (e.g. fast-cache-invalidation)');
    process.exitCode = 1;
    return;
  }

  let recapUri = null;
  if (opts.recap) {
    if (!REF_PATTERN.test(opts.recap)) {
      if (opts.json) {
        jsonError('--recap must be exactly three lowercase words separated by dashes');
        return;
      }
      console.error('error: --recap must be exactly three lowercase words separated by dashes (e.g. fast-cache-invalidation)');
      process.exitCode = 1;
      return;
    }

    const caps = readLog('caps.jsonl');
    const localMatch = caps.find(e => e.ref === opts.recap);
    if (localMatch) {
      recapUri = localMatch.uri;
      if (verbose) vlog(`[verbose] recap resolved locally: ${recapUri}`);
    }
  }

  if (opts.kind) {
    const validKinds = ['feat', 'fix', 'test', 'docs', 'refactor', 'chore', 'perf', 'style', 'request'];
    if (!validKinds.includes(opts.kind)) {
      if (opts.json) {
        jsonError(`--kind must be one of: ${validKinds.join(', ')}`);
        return;
      }
      console.error(`error: --kind must be one of: ${validKinds.join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }

  const now = new Date().toISOString();

  // preflight: session
  let agent, session;
  try {
    ({ agent, session } = await restoreAgent(did));
  } catch {
    if (opts.json) {
      jsonError('session expired or invalid', "run 'vit login <handle>'");
      return;
    }
    console.error(`session expired or invalid. tell your operator to run '${name} login <handle>'.`);
    process.exitCode = 1;
    return;
  }
  if (verbose) vlog(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

  if (opts.recap && !recapUri) {
    const following = readFollowing();
    const dids = following.map(e => e.did);
    dids.push(did);

    const allRecords = await batchQuery(dids, async (repoDid) => {
      const pds = await resolvePds(repoDid);
      if (verbose) vlog(`[verbose] ${repoDid}: resolved PDS ${pds}`);
      return (await listRecordsFromPds(pds, repoDid, CAP_COLLECTION, 50)).records;
    }, { verbose });

    let match = null;
    for (const records of allRecords) {
      for (const rec of records) {
        const recRef = resolveRef(rec.value, rec.cid);
        if (recRef === opts.recap) {
          if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
            match = rec;
          }
        }
      }
    }

    if (match) {
      recapUri = match.uri;
      if (verbose) vlog(`[verbose] recap resolved remotely: ${recapUri}`);
    } else {
      if (opts.json) {
        jsonError(`could not find cap with ref '${opts.recap}' to recap`);
        return;
      }
      console.error(`error: could not find cap with ref '${opts.recap}' to recap`);
      process.exitCode = 1;
      return;
    }
  }

  const record = {
    $type: CAP_COLLECTION,
    text: text || '',
    title: opts.title,
    description: opts.description,
    ref,
    createdAt: now,
  };
  if (beacon) record.beacon = beacon;
  if (opts.kind) record.kind = opts.kind;
  if (opts.recap) record.recap = { uri: recapUri, ref: opts.recap };
  const rkey = TID.nextStr();
  if (verbose) vlog(`[verbose] Record built, rkey: ${rkey}`);
  const putArgs = {
    repo: did,
    collection: CAP_COLLECTION,
    rkey,
    record,
    validate: false,
  };
  if (verbose) vlog(`[verbose] putRecord ${putArgs.collection} rkey=${rkey}`);
  const putRes = await agent.com.atproto.repo.putRecord(putArgs);
  try {
    appendLog('caps.jsonl', {
      ts: now,
      did,
      rkey,
      ref,
      collection: CAP_COLLECTION,
      pds: session.serverMetadata?.issuer,
      uri: putRes.data.uri,
      cid: putRes.data.cid,
    });
  } catch (logErr) {
    console.error('warning: failed to write caps.jsonl:', logErr.message);
  }
  if (verbose) vlog(`[verbose] Log written to caps.jsonl`);
  if (opts.json) {
    const out = { ref, uri: putRes.data.uri };
    if (opts.kind) out.kind = opts.kind;
    jsonOk(out);
    return;
  }
  if (isRequest) {
    console.log(`shipped: ${ref} (kind: request)`);
    console.log(`beacon:  ${beacon}`);
    console.log(`anyone can implement this. share the ref to build demand.`);
  } else {
    console.log(`shipped: ${ref}`);
    console.log(`uri: ${putRes.data.uri}`);
  }
  if (verbose) {
    vlog(
      JSON.stringify({
        ts: now,
        pds: session.serverMetadata?.issuer,
        xrpc: 'com.atproto.repo.putRecord',
        request: putArgs,
        response: putRes.data,
      }),
    );
  }
}

export default function register(program) {
  program
    .command('ship')
    .description('Publish a cap or skill to your feed')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--json', 'Output as JSON')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .option('--title <title>', 'Short title for the cap')
    .option('--description <description>', 'Description of the cap')
    .option('--ref <ref>', 'Three lowercase words with dashes (e.g. fast-cache-invalidation); auto-generated from title when --kind request')
    .option('--beacon <beacon>', 'Beacon URI or GitHub URL for the cap (required when --kind request outside a vit-initialized dir)')
    .option('--recap <ref>', 'Ref of the cap this derives from (quote-post semantics)')
    .option('--kind <kind>', 'Category: feat, fix, test, docs, refactor, chore, perf, style, request')
    .option('--skill <path>', 'Publish a skill directory (reads SKILL.md + resources)')
    .option('--tags <tags>', 'Comma-separated discovery tags (for skills)')
    .option('--version <version>', 'Version string (for skills, overrides frontmatter)')
    .option('--license <license>', 'SPDX license identifier (for skills, overrides frontmatter)')
    .action(async (opts) => {
      try {
        if (opts.skill) {
          await shipSkill(opts);
        } else {
          // Validate required cap fields
          if (!opts.title) {
            if (opts.json) {
              jsonError("required option '--title <title>' not specified");
              return;
            }
            console.error("error: required option '--title <title>' not specified");
            process.exitCode = 1;
            return;
          }
          if (!opts.description) {
            if (opts.json) {
              jsonError("required option '--description <description>' not specified");
              return;
            }
            console.error("error: required option '--description <description>' not specified");
            process.exitCode = 1;
            return;
          }
          if (!opts.ref && opts.kind !== 'request') {
            if (opts.json) {
              jsonError("required option '--ref <ref>' not specified");
              return;
            }
            console.error("error: required option '--ref <ref>' not specified");
            process.exitCode = 1;
            return;
          }
          await shipCap(opts);
        }
      } catch (err) {
        if (opts.json) {
          jsonError(err);
          return;
        }
        console.error(formatError(err, { verbose: opts.verbose }));
        process.exitCode = 1;
      }
    })
    .addHelpText('after', `
Authoring guidance (for coding agents):

  Refer to the using-vit skill (skills/vit/SKILL.md) for a complete shipping guide.

  Cap fields:
    --title          Short name for the cap (2-5 words)
    --description    One sentence explaining what this cap does
    --ref            Three lowercase words with dashes (your-ref-name)
    --recap <ref>    Optional. Ref of the cap this derives from (links back to original)
    --kind <kind>    Category: feat, fix, test, docs, refactor, chore, perf, style, request
    body (stdin)     Full cap content, piped or via heredoc (optional when --kind request)

  Request caps (--kind request):
    --beacon <url>   GitHub URL or vit: URI for the project being requested (auto-read from .vit if omitted)
    --ref            Optional; auto-generated from title if not provided

  Skill fields:
    --skill <path>   Path to skill directory containing SKILL.md
    --tags <tags>    Comma-separated discovery tags
    --version <ver>  Version override (defaults to SKILL.md frontmatter)
    --license <id>   License override (defaults to SKILL.md frontmatter)

  Examples:
    # Ship a cap
    vit ship --title "Fast LRU Cache" \\
             --description "Thread-safe LRU cache with O(1) eviction" \\
             --ref "fast-lru-cache" \\
             <<'EOF'
    ... full cap body text ...
    EOF

    # Ship a skill
    vit ship --skill ./skills/agent-test-patterns/ \\
             --tags "testing,agents,claude"`);
}
