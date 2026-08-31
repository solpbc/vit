// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import {
  BEACON_ACCEPTED_FORMS,
  beaconToHttps,
  looksLikeIdentityBeacon,
  normalizeBeacon,
  parseGitUrl,
  tryNormalizeBeacon,
} from '../src/lib/beacon.js';

describe('normalizeBeacon', () => {
  const canonical = 'vit:github.com/owner/repo';

  test.each([
    'vit:github.com/Owner/Repo',
    'https://github.com/Owner/Repo.git',
    'ssh://git@github.com/Owner/Repo.git',
    'git@github.com:Owner/Repo.git',
    'github.com/Owner/Repo',
  ])('normalizes supported form %s', (input) => {
    expect(normalizeBeacon(input, '--beacon')).toBe(canonical);
  });

  test('is idempotent', () => {
    expect(normalizeBeacon(normalizeBeacon(canonical, '--beacon'), '--beacon')).toBe(canonical);
  });

  test('SCP SSH without .git', () =>
    expect(normalizeBeacon('git@github.com:org/repo', '--beacon')).toBe('vit:github.com/org/repo'));
  test('SSH URL with port', () =>
    expect(normalizeBeacon('ssh://git@github.com:22/org/repo.git', '--beacon')).toBe('vit:github.com/org/repo'));
  test('HTTPS without .git', () =>
    expect(normalizeBeacon('https://github.com/org/repo', '--beacon')).toBe('vit:github.com/org/repo'));
  test('HTTPS trailing slash', () =>
    expect(normalizeBeacon('https://github.com/org/repo/', '--beacon')).toBe('vit:github.com/org/repo'));
  test('git protocol', () =>
    expect(normalizeBeacon('git://github.com/org/repo.git', '--beacon')).toBe('vit:github.com/org/repo'));
  test('bare slug with .git', () =>
    expect(normalizeBeacon('github.com/org/repo.git', '--beacon')).toBe('vit:github.com/org/repo'));

  test('trims whitespace', () =>
    expect(normalizeBeacon(' \n https://GitHub.Com/Owner/Repo.git \t', '--beacon')).toBe(canonical));
  test('ignores query and fragment text without changing the path grammar', () => {
    expect(normalizeBeacon('https://github.com/Owner/Repo.git?tab=readme#usage', '--beacon')).toBe(canonical);
  });

  test('SCP case normalization', () =>
    expect(normalizeBeacon('git@GitHub.Com:Owner/Repo.git', '--beacon')).toBe(canonical));

  test('no-org SCP (tilde)', () =>
    expect(normalizeBeacon('git@sr.ht:~user/repo.git', '--beacon')).toBe('vit:sr.ht/~user/repo'));
  test('no-org SCP single segment', () =>
    expect(normalizeBeacon('git@myhost.com:repo.git', '--beacon')).toBe('vit:myhost.com//repo'));
  test('no-org HTTPS', () =>
    expect(normalizeBeacon('https://myhost.com/repo.git', '--beacon')).toBe('vit:myhost.com//repo'));
  test('no-org bare slug', () =>
    expect(normalizeBeacon('myhost.com/repo', '--beacon')).toBe('vit:myhost.com//repo'));
  test('ownerless vit URI double slash round-trips', () => {
    const beacon = 'vit:knot.commonscomputer.com//did:plc:mfquhie7kthb4ig453glwgdk';
    expect(normalizeBeacon(beacon, '--beacon')).toBe(beacon);
  });

  test('dotted owner is preserved', () => {
    expect(normalizeBeacon('https://tangled.org/solpbc.org/rookery', '--beacon'))
      .toBe('vit:tangled.org/solpbc.org/rookery');
  });

  test.each([
    '',
    '   ',
    'vit:',
    'repo',
    'https://github.com/',
    'github.com/a/b/c',
    null,
    undefined,
    123,
    {},
  ])('rejects malformed or non-string input %#', (input) => {
    expect(() => normalizeBeacon(input, '--beacon')).toThrow(
      `Invalid beacon from --beacon: expected ${BEACON_ACCEPTED_FORMS}.`,
    );
  });

  test('strict error names a config field without echoing its value', () => {
    const bad = 'secret-not-a-url';
    expect(() => normalizeBeacon(bad, '.vit/config.json "beacon"')).toThrow(
      `Invalid beacon from .vit/config.json "beacon": expected ${BEACON_ACCEPTED_FORMS}.`,
    );
    try {
      normalizeBeacon(bad, '.vit/config.json "beacon"');
    } catch (err) {
      expect(err.message).not.toContain(bad);
    }
  });

  test('tolerant form returns canonical values or null', () => {
    expect(tryNormalizeBeacon('https://github.com/Owner/Repo.git')).toBe(canonical);
    expect(tryNormalizeBeacon(canonical)).toBe(canonical);
    expect(tryNormalizeBeacon('not a url')).toBeNull();
    expect(tryNormalizeBeacon(null)).toBeNull();
  });
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

describe('looksLikeIdentityBeacon', () => {
  test('true for a Tangled-knot-shaped beacon (host + bare DID, no repo)', () =>
    expect(looksLikeIdentityBeacon('vit:knot.commonscomputer.com//did:plc:mfquhie7kthb4ig453glwgdk')).toBe(true));
  test('true when the DID sits in the org position', () =>
    expect(looksLikeIdentityBeacon('vit:knot.example.com/did:plc:abc123/somerepo')).toBe(true));
  test('true for a did:web identity', () =>
    expect(looksLikeIdentityBeacon('vit:knot.example.com//did:web:example.com')).toBe(true));
  test('false for an ordinary org/repo beacon', () =>
    expect(looksLikeIdentityBeacon('vit:github.com/solpbc/vit')).toBe(false));
  test('false for an ordinary no-org beacon', () =>
    expect(looksLikeIdentityBeacon('vit:tangled.org//assemblinker')).toBe(false));
  test('false for a beacon without the vit: prefix stripped first', () =>
    expect(looksLikeIdentityBeacon('knot.example.com//did:plc:abc123')).toBe(true));
  test('false for non-string input', () => {
    expect(looksLikeIdentityBeacon(null)).toBe(false);
    expect(looksLikeIdentityBeacon(undefined)).toBe(false);
    expect(looksLikeIdentityBeacon(42)).toBe(false);
  });
  test('false for a beacon with no slash at all', () =>
    expect(looksLikeIdentityBeacon('vit:justahost')).toBe(false));
});
