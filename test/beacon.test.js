// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { toBeacon, parseGitUrl, beaconToHttps } from '../src/lib/beacon.js';

describe('toBeacon', () => {
  test('SCP SSH with .git', () => expect(toBeacon('git@github.com:org/repo.git')).toBe('github.com/org/repo'));
  test('SCP SSH without .git', () => expect(toBeacon('git@github.com:org/repo')).toBe('github.com/org/repo'));

  test('SSH URL', () => expect(toBeacon('ssh://git@github.com/org/repo.git')).toBe('github.com/org/repo'));
  test('SSH URL with port', () => expect(toBeacon('ssh://git@github.com:22/org/repo.git')).toBe('github.com/org/repo'));

  test('HTTPS with .git', () => expect(toBeacon('https://github.com/org/repo.git')).toBe('github.com/org/repo'));
  test('HTTPS without .git', () => expect(toBeacon('https://github.com/org/repo')).toBe('github.com/org/repo'));
  test('HTTPS trailing slash', () => expect(toBeacon('https://github.com/org/repo/')).toBe('github.com/org/repo'));

  test('git protocol', () => expect(toBeacon('git://github.com/org/repo.git')).toBe('github.com/org/repo'));

  test('bare slug', () => expect(toBeacon('github.com/org/repo')).toBe('github.com/org/repo'));
  test('bare slug with .git', () => expect(toBeacon('github.com/org/repo.git')).toBe('github.com/org/repo'));

  test('case normalization', () => expect(toBeacon('GitHub.Com/Org/Repo.git')).toBe('github.com/org/repo'));
  test('SCP case normalization', () =>
    expect(toBeacon('git@GitHub.Com:Org/Repo.git')).toBe('github.com/org/repo'));
  test('HTTPS case normalization', () =>
    expect(toBeacon('https://GitHub.Com/Org/Repo')).toBe('github.com/org/repo'));

  test('no-org SCP (tilde)', () => expect(toBeacon('git@sr.ht:~user/repo.git')).toBe('sr.ht/~user/repo'));
  test('no-org SCP single segment', () => expect(toBeacon('git@myhost.com:repo.git')).toBe('myhost.com//repo'));
  test('no-org HTTPS', () => expect(toBeacon('https://myhost.com/repo.git')).toBe('myhost.com//repo'));
  test('no-org bare slug', () => expect(toBeacon('myhost.com/repo')).toBe('myhost.com//repo'));

  test('this repo (solpbc/vit)', () => expect(toBeacon('git@github.com:solpbc/vit.git')).toBe('github.com/solpbc/vit'));

  test('empty string throws', () => expect(() => toBeacon('')).toThrow('Invalid git URL'));
  test('null throws', () => expect(() => toBeacon(null)).toThrow('Invalid git URL'));
  test('undefined throws', () => expect(() => toBeacon(undefined)).toThrow('Invalid git URL'));
  test('number throws', () => expect(() => toBeacon(123)).toThrow('Invalid git URL'));
  test('bare word throws', () => expect(() => toBeacon('repo')).toThrow('Invalid git URL'));
  test('too many segments throws', () => expect(() => toBeacon('github.com/a/b/c')).toThrow('Invalid git URL'));
});

describe('parseGitUrl', () => {
  test('returns { host, org, repo } for two-segment path', () => {
    const r = parseGitUrl('https://github.com/org/repo.git');
    expect(r).toEqual({ host: 'github.com', org: 'org', repo: 'repo' });
  });

  test('returns empty org for single-segment path', () => {
    const r = parseGitUrl('git@myhost.com:repo.git');
    expect(r).toEqual({ host: 'myhost.com', org: '', repo: 'repo' });
  });
});

describe('beaconToHttps', () => {
  test('vit: URI with org', () =>
    expect(beaconToHttps('vit:github.com/solpbc/vit')).toBe('https://github.com/solpbc/vit'));
  test('vit: URI no-org (double slash)', () =>
    expect(beaconToHttps('vit:myhost.com//repo')).toBe('https://myhost.com/repo'));
  test('HTTPS URL passthrough', () =>
    expect(beaconToHttps('https://github.com/org/repo.git')).toBe('https://github.com/org/repo'));
  test('SSH URL conversion', () =>
    expect(beaconToHttps('git@github.com:org/repo.git')).toBe('https://github.com/org/repo'));
  test('bare slug conversion', () =>
    expect(beaconToHttps('github.com/org/repo')).toBe('https://github.com/org/repo'));
  test('no-org HTTPS', () =>
    expect(beaconToHttps('https://myhost.com/repo.git')).toBe('https://myhost.com/repo'));
  test('no-org SCP', () =>
    expect(beaconToHttps('git@myhost.com:repo.git')).toBe('https://myhost.com/repo'));
  test('invalid input throws', () =>
    expect(() => beaconToHttps('notaurl')).toThrow('Invalid git URL'));
  test('empty vit: URI throws', () =>
    expect(() => beaconToHttps('vit:')).toThrow('Invalid beacon URI'));
});
