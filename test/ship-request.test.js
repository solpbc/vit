// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentEnv = { CLAUDECODE: '1' };

function makeVitDir(base, beacon) {
  const vitDir = join(base, '.vit');
  mkdirSync(vitDir, { recursive: true });
  writeFileSync(join(vitDir, 'config.json'), JSON.stringify({ beacon }));
  return base;
}

describe('vit ship --kind request', () => {
  test('accepts request as a valid kind value (errors at auth, not validation)', () => {
    const tmp = join(tmpdir(), '.test-ship-req-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/test/project');
    const r = run(
      'ship --kind request --title "Add async validation" --description "Need async validators" --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    expect(r.stderr).not.toMatch(/--kind must be one of/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('rejects request without beacon when not in vit-initialized dir', () => {
    const tmp = join(tmpdir(), '.test-ship-req-nobeacon-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run(
      'ship --kind request --title "Add async validation" --description "Need async validators" --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('request caps must be addressed to a project');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('accepts --beacon flag for request caps outside vit dir', () => {
    const tmp = join(tmpdir(), '.test-ship-req-beacon-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run(
      'ship --kind request --title "Add async validation" --description "Need async validators" --beacon github.com/pydantic/pydantic --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    // Should not fail on beacon validation — will fail at auth
    expect(r.stderr).not.toContain('request caps must be addressed to a project');
    expect(r.stderr).not.toMatch(/--kind must be one of/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('normalizes github.com URL to vit: beacon', () => {
    const tmp = join(tmpdir(), '.test-ship-req-norm-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run(
      'ship --kind request --title "Add async validation" --description "Need async validators" --beacon github.com/pydantic/pydantic --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    // Beacon normalization succeeds; error is at auth
    expect(r.stderr).not.toContain('invalid --beacon');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('auto-generates ref from title when --ref not provided', () => {
    const tmp = join(tmpdir(), '.test-ship-req-autoref-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/test/project');
    const r = run(
      'ship --kind request --title "Add async validation support" --description "Need async validators" --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    // Should not fail on missing --ref
    expect(r.stderr).not.toMatch(/--ref.*not specified/i);
    // Auto-generated ref is printed (fails at auth, not ref generation)
    expect(r.stderr).not.toMatch(/three lowercase words/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('requires --title for ref auto-generation', () => {
    const tmp = join(tmpdir(), '.test-ship-req-notitle-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/test/project');
    const r = run(
      'ship --kind request --description "Need async validators" --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    // Missing --title is caught before ref generation
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--title/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('text is optional for request caps (empty stdin does not error)', () => {
    const tmp = join(tmpdir(), '.test-ship-req-notext-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/test/project');
    const r = run(
      'ship --kind request --title "Add async validation support" --description "Need async validators" --did did:plc:abc',
      tmp,
      agentEnv,
      '',
    );
    // Should not error on empty stdin for request caps
    expect(r.stderr).not.toMatch(/body is required/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('--help shows request in --kind options', () => {
    const r = run('ship --help');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('request');
  });

  test('--help shows --beacon option', () => {
    const r = run('ship --help');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('--beacon');
  });
});
