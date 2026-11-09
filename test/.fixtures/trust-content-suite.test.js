// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Command } from 'commander';
import * as childProcess from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let records;
let installs;
let vouches;
const realExecFile = childProcess.execFile;
mock.module('node:child_process', () => ({
  execFile: realExecFile,
  spawnSync: (...args) => { installs.push(args); return { status: 0 }; },
}));
mock.module('../../src/lib/oauth.js', () => ({
  restoreAgent: async () => ({ agent: { com: { atproto: { repo: {
    putRecord: async (args) => {
      vouches.push(args);
      return { data: { uri: 'at://did:plc:self/org.v-it.vouch/test' } };
    },
  } } } } }),
}));
mock.module('../../src/lib/pds.js', () => ({
  resolvePds: async () => 'https://pds.example',
  resolveHandle: async () => 'did:plc:author',
  listRecordsFromPds: async () => ({ records }),
  batchQuery: async (_items, fn) => [await fn('did:plc:author')],
}));
mock.module('../../src/lib/sandbox.js', () => ({
  sandboxArgs: () => ({
    cmd: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({safe:true,concerns:[],summary:"test verdict"}))'],
    env: {},
  }),
}));

const { default: registerVet } = await import('../../src/cmd/vet.js');
const { default: registerLearn } = await import('../../src/cmd/learn.js');
const { default: registerRemix } = await import('../../src/cmd/remix.js');
const { default: registerVouch } = await import('../../src/cmd/vouch.js');

describe('content-bound trust', () => {
  let dir;
  let spies;
  let savedEnv;
  let logs;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), '.test-trust-content-'));
    mkdirSync(join(dir, '.vit'));
    writeFileSync(join(dir, '.vit/config.json'), JSON.stringify({ beacon: 'vit:github.com/test/project' }));
    logs = [];
    spies = [
      spyOn(process, 'cwd').mockReturnValue(dir),
      spyOn(console, 'log').mockImplementation((line) => logs.push(line)),
      spyOn(console, 'error').mockImplementation(() => {}),
    ];
    savedEnv = { ...process.env };
    for (const key of ['CLAUDECODE', 'GEMINI_CLI', 'CODEX_CI', 'OPENCODE', 'AI_AGENT', 'PI_CODING_AGENT']) {
      delete process.env[key];
    }
    process.env.CODEX_CI = '1';
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, '.config');
    process.exitCode = 0;
    installs = [];
    vouches = [];
  });

  afterEach(() => {
    spies.forEach(spy => spy.mockRestore());
    process.env = savedEnv;
    process.exitCode = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  function item(skill = false) {
    return {
      uri: `at://did:plc:author/org.v-it.${skill ? 'skill' : 'cap'}/test`,
      cid: 'bafy-original',
      value: {
        ref: 'content-trust-test', name: 'trust-test', title: 'Trust test',
        text: 'original reviewed instructions', createdAt: '2026-01-01T00:00:00Z',
        beacon: 'vit:github.com/test/project',
      },
    };
  }

  function trust(ref, entries) {
    writeFileSync(join(dir, '.vit/trusted.jsonl'), entries.map(entry => JSON.stringify({ ref, ...entry })).join('\n') + '\n');
  }

  async function run(register, args) {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync([...args, '--did', 'did:plc:self', '--json'], { from: 'user' });
    return JSON.parse(logs.at(-1));
  }

  for (const [label, register, skill, extra] of [
    ['learn', registerLearn, true, []],
    ['global learn', registerLearn, true, ['--user']],
    ['remix', registerRemix, false, []],
    ['cap vouch', registerVouch, false, []],
    ['skill vouch', registerVouch, true, []],
  ]) {
    for (const change of ['cid', 'uri', 'legacy', 'missing cid', 'empty cid']) {
      test(`${label} refuses ${change} before using content`, async () => {
        const original = item(skill);
        const ref = skill ? 'skill-trust-test' : original.value.ref;
        const entry = { uri: original.uri, cid: original.cid };
        if (change === 'legacy') delete entry.cid;
        trust(ref, [entry]);
        const live = structuredClone(original);
        if (change === 'cid') {
          live.cid = 'bafy-changed';
          live.value.text = 'unreviewed replacement instructions';
        }
        if (change === 'uri') live.uri = live.uri.replace('did:plc:author', 'did:plc:other');
        if (change === 'missing cid') delete live.cid;
        if (change === 'empty cid') live.cid = '';
        records = [live];

        const result = await run(register, [label.includes('learn') ? 'learn' : label.includes('vouch') ? 'vouch' : 'remix', ref, ...extra]);
        expect(process.exitCode).toBe(1);
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).toContain(`vit vet ${ref}`);
        expect(result).not.toHaveProperty('text');
        expect(installs).toHaveLength(0);
        expect(vouches).toHaveLength(0);
        expect(existsSync(join(dir, '.vit/learned.jsonl'))).toBe(false);
        expect(existsSync(join(dir, '.vit/vouched.jsonl'))).toBe(false);
      });
    }

    test(`${label} accepts a fresh vet after an older entry`, async () => {
      const live = item(skill);
      const ref = skill ? 'skill-trust-test' : live.value.ref;
      trust(ref, [{ uri: live.uri }, { uri: live.uri, cid: 'bafy-old' }]);
      records = [live];
      expect((await run(registerVet, ['vet', ref, '--trust', '--confirm'])).ok).toBe(true);
      logs = [];
      const result = await run(register, [label.includes('learn') ? 'learn' : label.includes('vouch') ? 'vouch' : 'remix', ref, ...extra]);
      expect(process.exitCode).toBe(0);
      expect(result.ok).toBe(true);
      if (register === registerLearn) expect(installs).toHaveLength(1);
      if (register === registerVouch) expect(vouches[0].record.subject).toEqual({ uri: live.uri, cid: live.cid });
      if (register === registerRemix) expect(result.text).toBe(live.value.text);
    });

    test(`${label} preserves its dangerous-accept policy for changed content`, async () => {
      const live = item(skill);
      const ref = skill ? 'skill-trust-test' : live.value.ref;
      trust(ref, [{ uri: live.uri, cid: 'bafy-old' }]);
      records = [live];
      writeFileSync(join(dir, '.vit/dangerous-accept'), '{}');
      const result = await run(register, [label.includes('learn') ? 'learn' : label.includes('vouch') ? 'vouch' : 'remix', ref, ...extra]);
      const bypass = label === 'learn' || label === 'remix';
      expect(result.ok).toBe(bypass);
      expect(process.exitCode).toBe(bypass ? 0 : 1);
      expect(installs).toHaveLength(label === 'learn' ? 1 : 0);
      expect(vouches).toHaveLength(0);
    });
  }

  for (const skill of [false, true]) {
    for (const sandbox of [false, true]) {
      test(`vet pins ${skill ? 'skill' : 'cap'} URI and CID with sandbox=${sandbox}`, async () => {
        const live = item(skill);
        const ref = skill ? 'skill-trust-test' : live.value.ref;
        records = [live];
        const result = await run(registerVet, ['vet', ref, '--trust', '--confirm', ...(sandbox ? ['--sandbox', 'claude'] : [])]);
        expect(result.ok).toBe(true);
        const entries = readFileSync(join(dir, '.vit/trusted.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
        expect(entries[0]).toMatchObject({ ref, uri: live.uri, cid: live.cid });
      });

      test(`vet refuses a missing CID with skill=${skill}, sandbox=${sandbox}`, async () => {
        const live = item(skill);
        const ref = skill ? 'skill-trust-test' : live.value.ref;
        delete live.cid;
        records = [live];
        const result = await run(registerVet, ['vet', ref, '--trust', '--confirm', ...(sandbox ? ['--sandbox', 'claude'] : [])]);
        expect(result.ok).toBe(false);
        expect(process.exitCode).toBe(1);
        expect(existsSync(join(dir, '.vit/trusted.jsonl'))).toBe(false);
      });
    }
  }

  test('a want-vouch remains a demand signal without vetting', async () => {
    records = [item()];
    const result = await run(registerVouch, ['vouch', records[0].value.ref, '--kind', 'want']);
    expect(result.ok).toBe(true);
    expect(vouches[0].record.kind).toBe('want');
  });

  test('explicit publisher install still works without local trust', async () => {
    records = [item(true)];
    const result = await run(registerLearn, ['learn', '@author.example/trust-test', '--project']);
    expect(result.ok).toBe(true);
    expect(installs).toHaveLength(1);
  });
});
