// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import {
  isValidSkillName,
  isSkillRef,
  isValidSkillRef,
  skillRefFromName,
  nameFromSkillRef,
  SKILL_NAME_PATTERN,
  SKILL_REF_PATTERN,
  SKILL_NAME_MAX,
} from '../src/lib/skill-ref.js';

describe('isValidSkillName', () => {
  test('accepts simple lowercase names', () => {
    expect(isValidSkillName('vit')).toBe(true);
    expect(isValidSkillName('agent-test-patterns')).toBe(true);
    expect(isValidSkillName('pdf-form-filler')).toBe(true);
  });

  test('accepts names with numbers', () => {
    expect(isValidSkillName('tool2')).toBe(true);
    expect(isValidSkillName('agent-v2-helper')).toBe(true);
  });

  test('rejects names starting with hyphen', () => {
    expect(isValidSkillName('-bad')).toBe(false);
  });

  test('rejects names with consecutive hyphens', () => {
    expect(isValidSkillName('bad--name')).toBe(false);
  });

  test('rejects names starting with number', () => {
    expect(isValidSkillName('3bad')).toBe(false);
  });

  test('rejects uppercase', () => {
    expect(isValidSkillName('BadName')).toBe(false);
    expect(isValidSkillName('ALLCAPS')).toBe(false);
  });

  test('rejects empty and null', () => {
    expect(isValidSkillName('')).toBe(false);
    expect(isValidSkillName(null)).toBe(false);
    expect(isValidSkillName(undefined)).toBe(false);
  });

  test('rejects names over 64 chars', () => {
    const long = 'a'.repeat(65);
    expect(isValidSkillName(long)).toBe(false);
    const justRight = 'a'.repeat(64);
    expect(isValidSkillName(justRight)).toBe(true);
  });

  test('rejects names with special chars', () => {
    expect(isValidSkillName('has_underscore')).toBe(false);
    expect(isValidSkillName('has.dot')).toBe(false);
    expect(isValidSkillName('has space')).toBe(false);
    expect(isValidSkillName('has@sign')).toBe(false);
  });

  test('rejects trailing hyphen', () => {
    expect(isValidSkillName('bad-')).toBe(false);
  });
});

describe('isSkillRef', () => {
  test('detects skill- prefix', () => {
    expect(isSkillRef('skill-vit')).toBe(true);
    expect(isSkillRef('skill-agent-test')).toBe(true);
  });

  test('rejects non-skill refs', () => {
    expect(isSkillRef('fast-cache-invalidation')).toBe(false);
    expect(isSkillRef('vit')).toBe(false);
    expect(isSkillRef('')).toBe(false);
    expect(isSkillRef(null)).toBe(false);
  });
});

describe('isValidSkillRef', () => {
  test('validates well-formed skill refs', () => {
    expect(isValidSkillRef('skill-vit')).toBe(true);
    expect(isValidSkillRef('skill-agent-test-patterns')).toBe(true);
    expect(isValidSkillRef('skill-pdf2')).toBe(true);
  });

  test('rejects invalid skill refs', () => {
    expect(isValidSkillRef('skill-')).toBe(false);
    expect(isValidSkillRef('skill--bad')).toBe(false);
    expect(isValidSkillRef('skill-Bad')).toBe(false);
    expect(isValidSkillRef('not-a-skill-ref')).toBe(false);
    expect(isValidSkillRef('')).toBe(false);
  });
});

describe('skillRefFromName / nameFromSkillRef', () => {
  test('round-trips correctly', () => {
    expect(skillRefFromName('vit')).toBe('skill-vit');
    expect(nameFromSkillRef('skill-vit')).toBe('vit');
    expect(nameFromSkillRef(skillRefFromName('agent-test'))).toBe('agent-test');
  });

  test('nameFromSkillRef returns null for non-skill refs', () => {
    expect(nameFromSkillRef('fast-cache-invalidation')).toBe(null);
    expect(nameFromSkillRef('')).toBe(null);
    expect(nameFromSkillRef(null)).toBe(null);
  });
});
