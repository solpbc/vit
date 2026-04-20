// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { Agent, AtpAgent } from '@atproto/api';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, configPath } from './paths.js';
import { errorMessage } from './error-format.js';

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
  if (existsSync(sessionFile)) {
    try {
      data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
    } catch (err) {
      console.warn(`warning: failed to read ${sessionFile}: ${errorMessage(err)}`);
    }
  }
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
  // Check project-local app-password session
  const localPath = join(process.cwd(), '.vit', 'login.json');
  try {
    if (existsSync(localPath)) {
      const local = JSON.parse(readFileSync(localPath, 'utf-8'));
      if (local.did === did && local.type === 'app-password' && local.session?.accessJwt) {
        return did;
      }
    }
  } catch (err) {
    console.warn(`warning: failed to read ${localPath}: ${errorMessage(err)}`);
  }

  const sessionFile = configPath('session.json');
  if (!existsSync(sessionFile)) return null;
  try {
    const raw = readFileSync(sessionFile, 'utf-8');
    const data = JSON.parse(raw);
    const entry = data[did];
    if (!entry) return null;
    // App-password session in global store
    if (entry.type === 'app-password') {
      return entry.session?.accessJwt ? did : null;
    }
    // OAuth session
    const tokenSet = entry?.tokenSet;
    if (!tokenSet) return null;
    const accessValid = tokenSet.expires_at && new Date(tokenSet.expires_at) > new Date();
    if (accessValid || tokenSet.refresh_token) return did;
    return null;
  } catch (err) {
    console.warn(`warning: failed to read ${sessionFile}: ${errorMessage(err)}`);
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
  // Check project-local app-password session
  const localPath = join(process.cwd(), '.vit', 'login.json');
  try {
    if (existsSync(localPath)) {
      const local = JSON.parse(readFileSync(localPath, 'utf-8'));
      if (local.did === did && local.type === 'app-password' && local.session) {
        const agent = new AtpAgent({ service: local.service || 'https://bsky.social' });
        await agent.resumeSession(local.session);
        return { agent, session: { did: local.did, handle: local.handle } };
      }
    }
  } catch (err) {
    console.warn(`warning: failed to read ${localPath}: ${errorMessage(err)}`);
  }

  // Check global app-password session
  const sessionFile = configPath('session.json');
  try {
    if (existsSync(sessionFile)) {
      const raw = readFileSync(sessionFile, 'utf-8');
      const data = JSON.parse(raw);
      const entry = data[did];
      if (entry?.type === 'app-password' && entry.session) {
        const agent = new AtpAgent({ service: entry.service || 'https://bsky.social' });
        await agent.resumeSession(entry.session);
        return { agent, session: { did, handle: entry.session.handle } };
      }
    }
  } catch (err) {
    console.warn(`warning: failed to read ${sessionFile}: ${errorMessage(err)}`);
  }

  // Existing OAuth restore path
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
