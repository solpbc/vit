CREATE TABLE IF NOT EXISTS caps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  rkey TEXT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  cid TEXT,
  title TEXT NOT NULL,
  description TEXT,
  ref TEXT NOT NULL,
  beacon TEXT,
  kind TEXT,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(did, rkey)
);

CREATE INDEX IF NOT EXISTS idx_caps_beacon ON caps(beacon);
CREATE INDEX IF NOT EXISTS idx_caps_created_at ON caps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caps_ref ON caps(ref);
CREATE INDEX IF NOT EXISTS idx_caps_kind ON caps(kind);

CREATE TABLE IF NOT EXISTS vouches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  rkey TEXT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  cid TEXT,
  cap_uri TEXT NOT NULL,
  ref TEXT NOT NULL,
  beacon TEXT,
  kind TEXT,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(did, rkey)
);

CREATE INDEX IF NOT EXISTS idx_vouches_cap_uri ON vouches(cap_uri);
CREATE INDEX IF NOT EXISTS idx_vouches_beacon ON vouches(beacon);
CREATE INDEX IF NOT EXISTS idx_vouches_kind ON vouches(kind);

CREATE TABLE IF NOT EXISTS beacons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  cap_count INTEGER NOT NULL DEFAULT 0,
  vouch_count INTEGER NOT NULL DEFAULT 0,
  last_activity TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS handles (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  rkey TEXT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  cid TEXT,
  name TEXT NOT NULL,
  description TEXT,
  ref TEXT NOT NULL,
  version TEXT,
  tags TEXT,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(did, rkey)
);

CREATE INDEX IF NOT EXISTS idx_skills_created_at ON skills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
