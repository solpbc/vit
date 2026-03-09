// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Agent } from '@atproto/api';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { configDir, configPath } from './paths.js';

const requestLock = async (_name, fn) => await fn();

const noopStore = {
  set: async () => {},
  get: async () => undefined,
  del: async () => {},
};

const clientMetadata = {
  client_id: 'https://v-it.org/client-metadata.json',
  client_name: 'vit CLI',
  application_type: 'native',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'atproto transition:generic',
  token_endpoint_auth_method: 'none',
  dpop_bound_access_tokens: true,
  client_uri: 'https://v-it.org',
};

export function createStore() {
  const map = new Map();

  return {
    set: async (key, value) => {
      map.set(key, value);
    },
    get: async (key) => map.get(key),
    del: async (key) => {
      map.delete(key);
    },
  };
}

export function createSessionStore() {
  const sessionFile = configPath('session.json');
  let data = {};
  try {
    data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
  } catch {}
  return {
    set: async (key, value) => {
      data[key] = value;
      mkdirSync(configDir, { recursive: true });
      writeFileSync(sessionFile, JSON.stringify(data, null, 2) + '\n');
    },
    get: async (key) => data[key],
    del: async (key) => {
      delete data[key];
      mkdirSync(configDir, { recursive: true });
      writeFileSync(sessionFile, JSON.stringify(data, null, 2) + '\n');
    },
  };
}

export function checkSession(did) {
  try {
    const raw = readFileSync(configPath('session.json'), 'utf-8');
    const data = JSON.parse(raw);
    const expiresAt = data[did]?.tokenSet?.expires_at;
    if (!expiresAt) return null;
    return new Date(expiresAt) > new Date() ? did : null;
  } catch {
    return null;
  }
}

export function createOAuthClient({ stateStore, sessionStore, redirectUri }) {
  return new NodeOAuthClient({
    requestLock,
    clientMetadata: {
      ...clientMetadata,
      redirect_uris: [redirectUri],
    },
    stateStore,
    sessionStore,
  });
}

export async function restoreAgent(did) {
  const sessionStore = createSessionStore();
  const client = new NodeOAuthClient({
    handleResolver: { resolve() { throw new Error('handle resolution not needed for restore'); } },
    requestLock,
    clientMetadata: {
      ...clientMetadata,
      redirect_uris: ['http://127.0.0.1'],
    },
    stateStore: noopStore,
    sessionStore,
  });
  const session = await client.restore(did);
  return { agent: new Agent(session), session };
}
