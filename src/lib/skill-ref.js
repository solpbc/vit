// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// Skill ref format: skill-{name}
// Name: lowercase letters, numbers, hyphens. No leading hyphen, no consecutive hyphens. Max 64 chars.

export const SKILL_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const SKILL_REF_PATTERN = /^skill-[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;

export function isValidSkillName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > SKILL_NAME_MAX) return false;
  return SKILL_NAME_PATTERN.test(name);
}

export function isSkillRef(ref) {
  if (!ref || typeof ref !== 'string') return false;
  return ref.startsWith('skill-');
}

export function skillRefFromName(name) {
  return `skill-${name}`;
}

export function nameFromSkillRef(ref) {
  if (!isSkillRef(ref)) return null;
  return ref.slice(6);
}

export function isValidSkillRef(ref) {
  if (!ref || typeof ref !== 'string') return false;
  // skill- prefix + valid name, total ref max 71 chars (6 + 64 + 1 for the hyphen in prefix)
  if (!SKILL_REF_PATTERN.test(ref)) return false;
  const name = nameFromSkillRef(ref);
  return name.length <= SKILL_NAME_MAX;
}
