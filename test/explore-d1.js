// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';

function d1Statement(db, sql, args = []) {
  return {
    sql,
    args,
    bind(...nextArgs) {
      return d1Statement(db, sql, nextArgs);
    },
    first() {
      return db.query(sql).get(...args) ?? null;
    },
    run() {
      return db.query(sql).run(...args);
    },
    all() {
      return { results: db.query(sql).all(...args) };
    },
  };
}

export function createD1(db) {
  const executeBatch = db.transaction((statements) => statements.map((stmt) => {
    if (/^\s*select\b/i.test(stmt.sql)) {
      return stmt.all();
    }
    return stmt.run();
  }));

  return {
    prepare(sql) {
      return d1Statement(db, sql);
    },
    batch(statements) {
      return executeBatch(statements);
    },
  };
}

export function createSqliteEnv() {
  const db = new Database(':memory:');
  const schemaPath = join(import.meta.dir, '..', 'explore', 'schema.sql');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return { db, env: { DB: createD1(db) } };
}

export function splitSqlStatements(text) {
  return text
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}
