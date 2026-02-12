// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

export function parseGitUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('Invalid git URL: ' + String(input));
  }

  const raw = input.trim();
  const normalizedError = () => new Error('Invalid git URL: ' + raw);

  let host = '';
  let path = '';

  if (raw.includes('@') && !raw.includes('://')) {
    const atIndex = raw.lastIndexOf('@');
    const hostAndPath = raw.slice(atIndex + 1);
    const colonIndex = hostAndPath.indexOf(':');
    if (colonIndex === -1) {
      throw normalizedError();
    }
    host = hostAndPath.slice(0, colonIndex);
    path = hostAndPath.slice(colonIndex + 1);
    if (!host || !path) {
      throw normalizedError();
    }
  } else if (raw.includes('://')) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw normalizedError();
    }
    host = url.hostname;
    path = url.pathname;
    if (!host) {
      throw normalizedError();
    }
  } else {
    const slashIndex = raw.indexOf('/');
    if (slashIndex !== -1) {
      const maybeHost = raw.slice(0, slashIndex);
      if (maybeHost.includes('.')) {
        host = maybeHost;
        path = raw.slice(slashIndex + 1);
        if (!host) {
          throw normalizedError();
        }
      } else {
        throw normalizedError();
      }
    } else {
      throw normalizedError();
    }
  }

  const cleanedPath = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  const segments = cleanedPath.split('/').filter(Boolean);

  if (segments.length === 0 || segments.length >= 3) {
    throw normalizedError();
  }

  let org = '';
  let repo = '';
  if (segments.length === 1) {
    repo = segments[0];
  } else {
    org = segments[0];
    repo = segments[1];
  }

  host = host.toLowerCase();
  org = org.toLowerCase();
  repo = repo.toLowerCase();

  if (!repo) {
    throw normalizedError();
  }

  return { host, org, repo };
}

export function toBeacon(input) {
  const { host, org, repo } = parseGitUrl(input);
  return org ? `${host}/${org}/${repo}` : `${host}//${repo}`;
}

export function beaconToHttps(input) {
  if (typeof input === 'string' && input.startsWith('vit:')) {
    const path = input.slice(4);
    if (!path) throw new Error('Invalid beacon URI: ' + input);
    return 'https://' + path.replace(/\/\//, '/');
  }
  const { host, org, repo } = parseGitUrl(input);
  return org ? `https://${host}/${org}/${repo}` : `https://${host}/${repo}`;
}
