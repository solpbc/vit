// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readBeaconSet, readFollowing, vitDir } from '../lib/vit-dir.js';
import { requireNotAgent, detectCodingAgent, toSandboxName } from '../lib/agent.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { isSkillRef, isValidSkillRef, nameFromSkillRef } from '../lib/skill-ref.js';
import { mark, brand, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';
import { loadConfig } from '../lib/config.js';
import { jsonOk, jsonError } from '../lib/json-output.js';
import { sandboxArgs } from '../lib/sandbox.js';

const execFileAsync = promisify(execFile);

const SANDBOX_SYSTEM_PROMPT = `You are a safety reviewer. Evaluate the following software capability or skill for safety concerns.

Respond with ONLY a JSON object (no markdown, no explanation outside the JSON):
{
  "safe": true or false,
  "concerns": ["list of specific concerns, empty if safe"],
  "summary": "one-sentence safety assessment"
}

Evaluate for: malicious code patterns, data exfiltration, unauthorized access, destructive operations, obfuscated logic, and social engineering.`;

async function runSandboxEval(agentName, contentText, opts) {
  const vlog = opts.json ? (...a) => console.error(...a) : console.log;
  if (opts.verbose) vlog(`[verbose] sandbox: spawning ${agentName} sub-agent`);

  const { cmd, args, env } = sandboxArgs(agentName, {
    prompt: contentText,
    systemPrompt: SANDBOX_SYSTEM_PROMPT,
  });

  let stdout;
  try {
    const result = await execFileAsync(cmd, args, {
      env: { ...process.env, ...env },
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (err) {
    if (err.killed) {
      throw new Error(`sandbox: ${agentName} sub-agent timed out after 30s`);
    }
    throw new Error(`sandbox: ${agentName} sub-agent failed: ${err.message}`);
  }

  if (opts.verbose) vlog(`[verbose] sandbox: raw output length ${stdout.length}`);

  // Claude wraps output in a JSON envelope with a "result" field containing the text.
  // Try to extract inner text from Claude's envelope first, then parse verdict.
  let text = stdout.trim();
  try {
    const envelope = JSON.parse(text);
    if (typeof envelope.result === 'string') {
      text = envelope.result.trim();
    }
  } catch {
    // Not a JSON envelope — use raw text
  }

  // Extract JSON from the text (may be wrapped in markdown code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('sandbox: sub-agent returned no JSON verdict');
  }

  let verdict;
  try {
    verdict = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('sandbox: sub-agent returned malformed JSON verdict');
  }

  if (typeof verdict.safe !== 'boolean') {
    throw new Error('sandbox: verdict missing "safe" field');
  }
  if (!Array.isArray(verdict.concerns)) {
    verdict.concerns = [];
  }
  if (typeof verdict.summary !== 'string') {
    verdict.summary = '';
  }

  return { safe: verdict.safe, concerns: verdict.concerns, summary: verdict.summary };
}

function resolveSandboxAgent(opts) {
  if (typeof opts.sandbox === 'string') {
    // Explicit agent name — validate it
    const valid = new Set(['claude', 'codex', 'gemini']);
    if (!valid.has(opts.sandbox)) {
      throw new Error(`unknown sandbox agent: '${opts.sandbox}'. must be one of: claude, codex, gemini`);
    }
    return opts.sandbox;
  }
  // opts.sandbox === true (flag without value) — auto-detect
  const detected = detectCodingAgent();
  if (!detected) {
    throw new Error('could not detect agent for sandbox. specify one explicitly: --sandbox claude');
  }
  const mapped = toSandboxName(detected.name);
  if (!mapped) {
    throw new Error(`detected agent '${detected.name}' has no sandbox mapping`);
  }
  return mapped;
}

function ensureGitignore() {
  const gitignorePath = join(vitDir(), '.gitignore');
  const entry = 'dangerous-accept';
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) return;
  }
  appendFileSync(gitignorePath, entry + '\n');
}

export default function register(program) {
  program
    .command('vet')
    .argument('[ref]', 'Cap or skill reference (e.g. fast-cache-invalidation or skill-agent-test-patterns)')
    .description('Review a cap or skill before trusting it')
    .option('--did <did>', 'DID to use')
    .option('--trust', 'Mark the item as locally trusted')
    .option('--dangerous-accept', 'Permanently disable vet gate for this project (human only)')
    .option('--confirm', 'Confirm dangerous-accept, or bypass agent gate with --trust')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--sandbox [agent]', 'Spawn a sandboxed sub-agent to evaluate safety')
    .action(async (ref, opts) => {
      try {
        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;
        // --- dangerous-accept flow ---
        if (opts.dangerousAccept) {
          const gate = requireNotAgent();
          if (!gate.ok) {
            if (opts.json) {
              jsonError('dangerous-accept is human-only');
              return;
            }
            console.error(`${name} vet --dangerous-accept is human-only. agents cannot set this flag.`);
            process.exitCode = 1;
            return;
          }

          if (opts.confirm) {
            // Write the flag file
            const dir = vitDir();
            const acceptPath = join(dir, 'dangerous-accept');
            writeFileSync(acceptPath, JSON.stringify({ acceptedAt: new Date().toISOString() }) + '\n');
            ensureGitignore();
            if (opts.json) {
              jsonOk({ dangerousAccept: true });
              return;
            }
            console.log('dangerous-accept enabled for this project.');
            console.log('');
            console.log('agents can now remix and learn without vetting.');
            console.log('to revoke: delete .vit/dangerous-accept');
          } else {
            if (opts.json) {
              jsonOk({ dangerousAccept: false, message: 'confirm with --confirm' });
              return;
            }
            console.log('');
            console.log('  WARNING: this permanently disables the vetting safety gate for all');
            console.log('  caps and skills in this project.');
            console.log('');
            console.log('  any agent running in this project can remix caps and learn skills');
            console.log('  without operator review. only do this if you trust the agent\'s judgment');
            console.log('  and the network sources you follow.');
            console.log('');
            console.log('  to proceed, confirm: vit vet --dangerous-accept --confirm');
          }
          return;
        }

        // --- Regular vet flow: ref is required ---
        if (!ref) {
          if (opts.json) {
            jsonError('ref argument is required', 'usage: vit vet <ref>');
            return;
          }
          console.error('ref argument is required for vetting. usage: vit vet <ref>');
          process.exitCode = 1;
          return;
        }

        const isSkill = isSkillRef(ref);

        // Validate ref format
        if (isSkill) {
          if (!isValidSkillRef(ref)) {
            if (opts.json) {
              jsonError('invalid skill ref', 'expected format: skill-{name}');
              return;
            }
            console.error('invalid skill ref. expected format: skill-{name} (lowercase letters, numbers, hyphens)');
            process.exitCode = 1;
            return;
          }
        } else {
          if (!REF_PATTERN.test(ref)) {
            if (opts.json) {
              jsonError('invalid ref', 'expected three lowercase words with dashes');
              return;
            }
            console.error('invalid ref. expected three lowercase words with dashes (e.g. fast-cache-invalidation)');
            process.exitCode = 1;
            return;
          }
        }

        // --- Agent gate ---
        const agent = detectCodingAgent();
        if (agent) {
          if ((opts.trust && opts.confirm) || opts.sandbox) {
            // Sandboxed sub-agent pattern — allow it
          } else {
            if (opts.json) {
              jsonError('vit vet is for operator review', 'use --trust --confirm to bypass');
              return;
            }
            console.error('vit vet is for operator review. agents should not vet directly.');
            console.error('');
            console.error('if you are a sandboxed sub-agent specifically tasked with vetting,');
            console.error('you can bypass this gate:');
            console.error('');
            console.error(`  vit vet ${ref} --trust --confirm`);
            console.error('');
            console.error('this will trust the ref without interactive review. only use this');
            console.error('if you are a dedicated vetting agent running in an isolated context.');
            process.exitCode = 1;
            return;
          }
        }

        const sandboxAgent = opts.sandbox ? resolveSandboxAgent(opts) : null;

        if (opts.json && !(opts.did || loadConfig().did)) {
          jsonError('no DID configured', "run 'vit login <handle>' first");
          return;
        }
        const did = requireDid(opts);
        if (!did) return;
        if (verbose) vlog(`[verbose] DID: ${did}`);

        if (!isSkill) {
          // Cap vet requires beacon
          const beaconSet = readBeaconSet();
          if (beaconSet.size === 0) {
            if (opts.json) {
              jsonError('no beacon set', "run 'vit init' first");
              return;
            }
            console.error(`no beacon set. run '${name} init' in a project directory first.`);
            process.exitCode = 1;
            return;
          }
          if (verbose) vlog(`[verbose] beacons: ${[...beaconSet].join(', ')}`);

          const { agent: oauthAgent } = await restoreAgent(did);
          if (verbose) vlog('[verbose] session restored');

          // build DID list from following + self
          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);

          // fetch caps from each DID, find matching ref
          const allRecords = await batchQuery(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) vlog(`[verbose] ${repoDid}: resolved PDS ${pds}`);
            return (await listRecordsFromPds(pds, repoDid, CAP_COLLECTION, 50)).records;
          }, { verbose });

          let match = null;
          for (const records of allRecords) {
            for (const rec of records) {
              if (!beaconSet.has(rec.value.beacon)) continue;
              const recRef = resolveRef(rec.value, rec.cid);
              if (recRef === ref) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
            }
          }

          if (!match) {
            if (opts.json) {
              jsonError(`no cap found with ref '${ref}' for this beacon`);
              return;
            }
            console.error(`no cap found with ref '${ref}' for this beacon.`);
            console.error('');
            console.error('hint: caps only appear from accounts you follow and your own.');
            console.error(`  vit following          check who you're following`);
            console.error(`  vit explore cap ${ref}  search the network-wide index`);
            process.exitCode = 1;
            return;
          }

          const record = match.value;

          if (opts.sandbox) {
            const contentText = [
              `Type: cap`,
              record.title ? `Title: ${record.title}` : '',
              record.description ? `Description: ${record.description}` : '',
              record.text ? `\nContent:\n${record.text}` : '',
            ].filter(Boolean).join('\n');

            const verdict = await runSandboxEval(sandboxAgent, contentText, opts);

            if (opts.trust) {
              if (verdict.safe) {
                appendLog('trusted.jsonl', {
                  ref,
                  uri: match.uri,
                  trustedAt: new Date().toISOString(),
                  sandboxVerdict: verdict,
                });
                if (opts.json) {
                  jsonOk({ trusted: true, ref, uri: match.uri, sandbox: verdict });
                  return;
                }
                console.log(`${mark} trusted: ${ref} (sandbox: safe)`);
                return;
              } else {
                // Unsafe — do NOT trust
                if (opts.json) {
                  jsonOk({ trusted: false, ref, uri: match.uri, sandbox: verdict });
                  process.exitCode = 1;
                  return;
                }
                console.error(`${mark} sandbox verdict: UNSAFE`);
                console.error(`  summary: ${verdict.summary}`);
                for (const c of verdict.concerns) {
                  console.error(`  - ${c}`);
                }
                console.error('');
                console.error('not trusted due to safety concerns.');
                process.exitCode = 1;
                return;
              }
            }

            // --sandbox without --trust: display verdict
            if (opts.json) {
              const author = match.uri.split('/')[2];
              jsonOk({ ref, type: 'cap', author, title: record.title || '', description: record.description || '', text: record.text || '', sandbox: verdict, trusted: false });
              return;
            }
            console.log(`${mark} sandbox verdict: ${verdict.safe ? 'SAFE' : 'UNSAFE'}`);
            console.log(`  summary: ${verdict.summary}`);
            if (verdict.concerns.length > 0) {
              for (const c of verdict.concerns) {
                console.log(`  - ${c}`);
              }
            }
            return;
          }

          if (opts.trust) {
            appendLog('trusted.jsonl', {
              ref,
              uri: match.uri,
              trustedAt: new Date().toISOString(),
            });
            if (opts.json) {
              jsonOk({ trusted: true, ref, uri: match.uri });
              return;
            }
            console.log(`${mark} trusted: ${ref}`);
            return;
          }

          const author = match.uri.split('/')[2];
          const title = record.title || '';
          const description = record.description || '';
          const text = record.text || '';

          if (opts.json) {
            jsonOk({ ref, type: 'cap', author, title, description, text });
            return;
          }

          console.log(`=== ${brand} cap review ===`);
          console.log('Review this cap carefully before trusting it.');
          console.log('');
          console.log(`  Ref:     ${ref}`);
          if (title) console.log(`  Title:   ${title}`);
          console.log(`  Author:  ${author}`);
          if (description) {
            console.log('');
            console.log(`  ${description}`);
          }
          if (text) {
            console.log('');
            console.log('--- Text ---');
            console.log(text);
            console.log('---');
          }
          console.log('');
          console.log('To trust this cap, run:');
          console.log('');
          console.log(`  vit vet ${ref} --trust`);
        } else {
          // Skill vet — no beacon required
          const skillName = nameFromSkillRef(ref);

          const { agent: oauthAgent } = await restoreAgent(did);
          if (verbose) vlog('[verbose] session restored');

          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);

          const allRecords = await batchQuery(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) vlog(`[verbose] ${repoDid}: resolved PDS ${pds}`);
            return (await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION, 50)).records;
          }, { verbose });

          let match = null;
          for (const records of allRecords) {
            for (const rec of records) {
              if (rec.value.name === skillName) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
            }
          }

          if (!match) {
            if (opts.json) {
              jsonError(`no skill found with ref '${ref}'`);
              return;
            }
            console.error(`no skill found with ref '${ref}' from followed accounts.`);
            console.error('');
            console.error('hint: skills appear from accounts you follow and your own.');
            console.error(`  vit following             check who you're following`);
            console.error(`  vit explore skills        browse skills network-wide`);
            process.exitCode = 1;
            return;
          }

          const record = match.value;

          if (opts.sandbox) {
            const parts = [
              `Type: skill`,
              `Name: ${record.name}`,
              record.description ? `Description: ${record.description}` : '',
              record.text ? `\nContent:\n${record.text}` : '',
            ];
            if (record.resources && record.resources.length > 0) {
              parts.push('\nResources:');
              for (const r of record.resources) {
                parts.push(`  ${r.path}${r.description ? ' — ' + r.description : ''}`);
              }
            }
            if (record.tags && record.tags.length > 0) {
              parts.push(`\nTags: ${record.tags.join(', ')}`);
            }
            const contentText = parts.filter(Boolean).join('\n');

            const verdict = await runSandboxEval(sandboxAgent, contentText, opts);

            if (opts.trust) {
              if (verdict.safe) {
                appendLog('trusted.jsonl', {
                  ref,
                  uri: match.uri,
                  trustedAt: new Date().toISOString(),
                  sandboxVerdict: verdict,
                });
                if (opts.json) {
                  jsonOk({ trusted: true, ref, uri: match.uri, sandbox: verdict });
                  return;
                }
                console.log(`${mark} trusted: ${ref} (sandbox: safe)`);
                return;
              } else {
                if (opts.json) {
                  jsonOk({ trusted: false, ref, uri: match.uri, sandbox: verdict });
                  process.exitCode = 1;
                  return;
                }
                console.error(`${mark} sandbox verdict: UNSAFE`);
                console.error(`  summary: ${verdict.summary}`);
                for (const c of verdict.concerns) {
                  console.error(`  - ${c}`);
                }
                console.error('');
                console.error('not trusted due to safety concerns.');
                process.exitCode = 1;
                return;
              }
            }

            // --sandbox without --trust: display verdict
            if (opts.json) {
              const author = match.uri.split('/')[2];
              jsonOk({
                ref, type: 'skill', name: record.name, author,
                version: record.version || null, license: record.license || null,
                description: record.description || null, text: record.text || null,
                sandbox: verdict, trusted: false,
              });
              return;
            }
            console.log(`${mark} sandbox verdict: ${verdict.safe ? 'SAFE' : 'UNSAFE'}`);
            console.log(`  summary: ${verdict.summary}`);
            if (verdict.concerns.length > 0) {
              for (const c of verdict.concerns) {
                console.log(`  - ${c}`);
              }
            }
            return;
          }

          if (opts.trust) {
            appendLog('trusted.jsonl', {
              ref,
              uri: match.uri,
              trustedAt: new Date().toISOString(),
            });
            if (opts.json) {
              jsonOk({ trusted: true, ref, uri: match.uri });
              return;
            }
            console.log(`${mark} trusted: ${ref}`);
            return;
          }

          const author = match.uri.split('/')[2];

          if (opts.json) {
            jsonOk({
              ref,
              type: 'skill',
              name: record.name,
              author,
              version: record.version || null,
              license: record.license || null,
              description: record.description || null,
              text: record.text || null,
            });
            return;
          }

          console.log(`=== ${brand} skill review ===`);
          console.log('Review this skill carefully before trusting it.');
          console.log('');
          console.log(`  Ref:         ${ref}`);
          console.log(`  Name:        ${record.name}`);
          console.log(`  Author:      ${author}`);
          if (record.version) console.log(`  Version:     ${record.version}`);
          if (record.license) console.log(`  License:     ${record.license}`);
          if (record.description) {
            console.log('');
            console.log(`  ${record.description}`);
          }
          if (record.compatibility) {
            console.log('');
            console.log(`  Compatibility: ${record.compatibility}`);
          }
          if (record.text) {
            console.log('');
            console.log('--- SKILL.md ---');
            console.log(record.text);
            console.log('---');
          }
          if (record.resources && record.resources.length > 0) {
            console.log('');
            console.log('Resources:');
            for (const r of record.resources) {
              const desc = r.description ? ` — ${r.description}` : '';
              console.log(`  ${r.path}${desc}`);
            }
          }
          if (record.tags && record.tags.length > 0) {
            console.log('');
            console.log(`  Tags: ${record.tags.join(', ')}`);
          }
          console.log('');
          console.log('To trust this skill, run:');
          console.log('');
          console.log(`  vit vet ${ref} --trust`);
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
    });
}
