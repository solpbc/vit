// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// This lives under test/.fixtures/ so top-level `bun test` does not auto-discover
// it in the shared process; its sibling wrapper executes it explicitly.
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';
import { Command } from 'commander';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CAP_URI = 'at://did:plc:author/org.v-it.cap/record';
const CAP_CID = 'bafycanonical';
const FAKE_HEAD = 'head';
const FAKE_TREE = 'tree';
const FAKE_VIT_TREE = 'vit-tree';
const FAKE_CONFIG_BLOB = 'config-blob';

let publishCalls = [];
let putRecordCalls = [];
let remoteRecords = [];
let remoteRepoConfig = {};

const fakeAgent = {
  resolveHandle: async () => ({ data: { did: 'did:plc:test' } }),
  com: {
    atproto: {
      repo: {
        describeRepo: async () => ({ data: { handle: 'test.example' } }),
        putRecord: async (args) => {
          putRecordCalls.push(args);
          return { data: { uri: 'at://did:plc:test/org.v-it.vouch/record', cid: 'bafyvouch' } };
        },
      },
    },
  },
};

mock.module('../../src/lib/cap.js', () => ({
  publishCap: async (_agent, input) => {
    publishCalls.push(input);
    return {
      uri: CAP_URI,
      cid: CAP_CID,
      record: input,
      response: { uri: CAP_URI, cid: CAP_CID },
    };
  },
}));

mock.module('../../src/lib/oauth.js', () => ({
  restoreAgent: async () => ({
    agent: fakeAgent,
    session: { serverMetadata: { issuer: 'https://pds.example' } },
  }),
}));

mock.module('../../src/lib/pds.js', () => ({
  resolvePds: async () => 'https://pds.example',
  resolveHandleFromDid: async () => 'test.example',
  listRecordsFromPds: async () => ({ records: remoteRecords }),
  batchQuery: async (items, fn) => Promise.all(items.map(fn)),
}));

mock.module('isomorphic-git', () => ({
  default: {
    clone: async () => {},
    resolveRef: async () => FAKE_HEAD,
    readObject: async ({ oid }) => {
      if (oid === FAKE_HEAD) return { object: { tree: FAKE_TREE } };
      if (oid === FAKE_TREE) return { object: [{ path: '.vit', oid: FAKE_VIT_TREE }] };
      if (oid === FAKE_VIT_TREE) {
        return { object: [{ path: 'config.json', oid: FAKE_CONFIG_BLOB }] };
      }
      if (oid === FAKE_CONFIG_BLOB) {
        return { object: new TextEncoder().encode(JSON.stringify(remoteRepoConfig)) };
      }
      return { object: [] };
    },
  },
}));

const [
  { shipCap },
  { default: registerBeacon },
  { default: registerRemix },
  { default: registerScan },
  { default: registerSkim },
  { default: registerVet },
  { default: registerVouch },
] = await Promise.all([
  import('../../src/cmd/ship.js'),
  import('../../src/cmd/beacon.js'),
  import('../../src/cmd/remix.js'),
  import('../../src/cmd/scan.js'),
  import('../../src/cmd/skim.js'),
  import('../../src/cmd/vet.js'),
  import('../../src/cmd/vouch.js'),
]);

function writeRawConfig(dir, config) {
  mkdirSync(join(dir, '.vit'), { recursive: true });
  writeFileSync(join(dir, '.vit', 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

function capRecord(beacon, overrides = {}) {
  return {
    uri: CAP_URI,
    cid: CAP_CID,
    value: {
      $type: 'org.v-it.cap',
      ref: 'canonical-beacon-test',
      title: 'Canonical Beacon',
      description: 'Canonical beacon test cap',
      text: 'test body',
      createdAt: '2026-07-27T00:00:00.000Z',
      beacon,
      ...overrides,
    },
  };
}

async function runRegistered(register, args) {
  const program = new Command();
  program.exitOverride();
  register(program);
  await program.parseAsync(args, { from: 'user' });
}

describe('canonical remote beacon behavior', () => {
  let testDir;
  let cwdSpy;
  let logSpy;
  let errorSpy;
  let warnSpy;
  let savedEnv;
  let savedWebSocket;

  beforeEach(() => {
    testDir = join(tmpdir(), '.test-canonical-beacon-remote-' + Math.random().toString(36).slice(2));
    mkdirSync(testDir, { recursive: true });
    cwdSpy = spyOn(process, 'cwd').mockReturnValue(testDir);
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    savedEnv = {
      CLAUDECODE: process.env.CLAUDECODE,
      GEMINI_CLI: process.env.GEMINI_CLI,
      CODEX_CI: process.env.CODEX_CI,
      OPENCODE: process.env.OPENCODE,
    };
    savedWebSocket = globalThis.WebSocket;
    process.env.CLAUDECODE = '';
    process.env.GEMINI_CLI = '';
    process.env.CODEX_CI = '';
    process.env.OPENCODE = '';
    process.exitCode = 0;
    publishCalls = [];
    putRecordCalls = [];
    remoteRecords = [];
    remoteRepoConfig = {};
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    globalThis.WebSocket = savedWebSocket;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
    rmSync(testDir, { recursive: true, force: true });
  });

  afterAll(() => {
    mock.restore();
  });

  function logs() {
    return logSpy.mock.calls.map(call => call.join(' ')).join('\n');
  }

  function enableAgent() {
    process.env.CODEX_CI = '1';
  }

  test('cap publication uses canonical primary config and explicit option values', async () => {
    enableAgent();
    writeRawConfig(testDir, { beacon: 'https://github.com/solpbc/thermals' });

    await shipCap({
      did: 'did:plc:test',
      kind: 'request',
      title: 'Canonical Beacon',
      description: 'Canonical config publication',
      ref: 'canonical-config-publication',
      json: true,
    });
    expect(publishCalls[0].beacon).toBe('vit:github.com/solpbc/thermals');

    rmSync(join(testDir, '.vit'), { recursive: true, force: true });
    await shipCap({
      did: 'did:plc:test',
      kind: 'request',
      title: 'Canonical Beacon',
      description: 'Canonical option publication',
      ref: 'canonical-option-publication',
      beacon: 'https://tangled.org/solpbc.org/rookery',
      json: true,
    });
    expect(publishCalls[1].beacon).toBe('vit:tangled.org/solpbc.org/rookery');
  });

  test('invalid explicit cap beacon invokes no publish collaborator', async () => {
    enableAgent();

    await shipCap({
      did: 'did:plc:test',
      kind: 'request',
      title: 'Canonical Beacon',
      description: 'Rejected publication',
      ref: 'rejected-beacon-publication',
      beacon: 'not a url',
      json: true,
    });

    expect(process.exitCode).toBe(1);
    expect(publishCalls).toHaveLength(0);
    expect(logs()).toContain('Invalid beacon from --beacon');
  });

  test('skim matches an HTTPS remote beacon against canonical local config and skips garbage', async () => {
    enableAgent();
    writeRawConfig(testDir, { beacon: 'https://github.com/solpbc/thermals' });
    remoteRecords = [
      capRecord('not a url', { ref: 'garbage-beacon-record' }),
      capRecord('https://github.com/solpbc/thermals'),
    ];

    await runRegistered(registerSkim, ['skim', '--did', 'did:plc:test', '--caps', '--json']);

    const output = JSON.parse(logSpy.mock.calls.at(-1)[0]);
    expect(output).toHaveLength(1);
    expect(output[0].value.ref).toBe('canonical-beacon-test');
  });

  test('remix matches an HTTPS remote beacon through a canonical secondary config', async () => {
    enableAgent();
    writeRawConfig(testDir, {
      beacon: 'vit:knot.commonscomputer.com//did:plc:mfquhie7kthb4ig453glwgdk',
      secondaryBeacon: 'https://tangled.org/solpbc.org/rookery',
    });
    writeFileSync(
      join(testDir, '.vit', 'trusted.jsonl'),
      JSON.stringify({ ref: 'canonical-beacon-test', uri: CAP_URI }) + '\n',
    );
    remoteRecords = [capRecord('https://tangled.org/solpbc.org/rookery')];

    await runRegistered(registerRemix, [
      'remix', 'canonical-beacon-test', '--did', 'did:plc:test', '--json',
    ]);

    const output = JSON.parse(logSpy.mock.calls.at(-1)[0]);
    expect(output.ok).toBe(true);
    expect(output.ref).toBe('canonical-beacon-test');
  });

  test('vet matches an HTTPS remote beacon and silently skips malformed remote values', async () => {
    writeRawConfig(testDir, { beacon: 'https://github.com/solpbc/thermals' });
    remoteRecords = [
      capRecord('not a url', { ref: 'garbage-beacon-record' }),
      capRecord('https://github.com/solpbc/thermals'),
    ];

    await runRegistered(registerVet, [
      'vet', 'canonical-beacon-test', '--did', 'did:plc:test', '--json',
    ]);

    const output = JSON.parse(logSpy.mock.calls.at(-1)[0]);
    expect(output.ok).toBe(true);
    expect(output.ref).toBe('canonical-beacon-test');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('vouch publishes and logs one canonical project beacon after remote alias matching', async () => {
    writeRawConfig(testDir, { beacon: 'https://github.com/solpbc/thermals' });
    writeFileSync(
      join(testDir, '.vit', 'trusted.jsonl'),
      JSON.stringify({ ref: 'canonical-beacon-test', uri: CAP_URI }) + '\n',
    );
    remoteRecords = [capRecord('https://github.com/solpbc/thermals')];

    await runRegistered(registerVouch, [
      'vouch', 'canonical-beacon-test', '--did', 'did:plc:test', '--json',
    ]);

    expect(putRecordCalls).toHaveLength(1);
    expect(putRecordCalls[0].record.beacon).toBe('vit:github.com/solpbc/thermals');
    const local = JSON.parse(
      readFileSync(join(testDir, '.vit', 'vouched.jsonl'), 'utf-8').trim(),
    );
    expect(local.beacon).toBe('vit:github.com/solpbc/thermals');
  });

  test('want vouch tolerant-normalizes the matched ownerless beacon for record and log', async () => {
    const ownerless = 'vit:knot.commonscomputer.com//did:plc:mfquhie7kthb4ig453glwgdk';
    remoteRecords = [capRecord(ownerless)];

    await runRegistered(registerVouch, [
      'vouch', 'canonical-beacon-test', '--kind', 'want', '--did', 'did:plc:test', '--json',
    ]);

    expect(putRecordCalls[0].record.beacon).toBe(ownerless);
    const local = JSON.parse(
      readFileSync(join(testDir, '.vit', 'vouched.jsonl'), 'utf-8').trim(),
    );
    expect(local.beacon).toBe(ownerless);
  });

  test('a malformed want-vouch fallback is omitted from both published record and log', async () => {
    remoteRecords = [capRecord('not a url')];

    await runRegistered(registerVouch, [
      'vouch', 'canonical-beacon-test', '--kind', 'want', '--did', 'did:plc:test', '--json',
    ]);

    expect(putRecordCalls[0].record).not.toHaveProperty('beacon');
    const local = JSON.parse(
      readFileSync(join(testDir, '.vit', 'vouched.jsonl'), 'utf-8').trim(),
    );
    expect(local.beacon).toBeNull();
  });

  test('scan matches a remote HTTPS alias and emits its canonical beacon', async () => {
    writeRawConfig(testDir, { beacon: 'https://github.com/solpbc/thermals' });
    const messages = [
      {
        kind: 'commit',
        did: 'did:plc:author',
        commit: {
          operation: 'create',
          collection: 'org.v-it.cap',
          cid: CAP_CID,
          record: capRecord('https://github.com/solpbc/thermals').value,
        },
      },
      {
        kind: 'commit',
        did: 'did:plc:garbage',
        commit: {
          operation: 'create',
          collection: 'org.v-it.cap',
          cid: 'bafygarbage',
          record: capRecord('not a url').value,
        },
      },
    ];
    globalThis.WebSocket = class FakeWebSocket {
      constructor() {
        queueMicrotask(() => {
          for (const message of messages) {
            this.onmessage?.({ data: JSON.stringify(message) });
          }
          this.onclose?.();
        });
      }

      close() {
        this.onclose?.();
      }
    };

    await runRegistered(registerScan, [
      'scan', '--beacon', '.', '--caps', '--days', '1', '--json',
    ]);

    const output = JSON.parse(logSpy.mock.calls.at(-1)[0]);
    expect(output.publishers).toHaveLength(1);
    expect(output.publishers[0].beacons).toEqual(['vit:github.com/solpbc/thermals']);
  });

  test('remote beacon display canonicalizes aliases and uses existing unlit wording for garbage', async () => {
    remoteRepoConfig = { beacon: 'https://tangled.org/solpbc.org/rookery' };
    await runRegistered(registerBeacon, ['beacon', 'vit:github.com/solpbc/vit']);
    expect(logs()).toContain('beacon: lit vit:tangled.org/solpbc.org/rookery');

    logSpy.mockClear();
    remoteRepoConfig = { beacon: 'not a url' };
    await runRegistered(registerBeacon, ['beacon', 'vit:github.com/solpbc/vit']);
    expect(logs()).toContain('beacon: unlit');
    expect(logs()).not.toContain('not a url');
  });
});
