-- Migration: add kind column to caps and vouches tables for cap-requests feature
-- Run: npx wrangler d1 execute vit-explore --file=migrate-cap-requests.sql

ALTER TABLE caps ADD COLUMN kind TEXT;
CREATE INDEX IF NOT EXISTS idx_caps_kind ON caps(kind);

-- Backfill kind from record_json for existing cap records
UPDATE caps SET kind = json_extract(record_json, '$.kind') WHERE kind IS NULL AND json_extract(record_json, '$.kind') IS NOT NULL;

ALTER TABLE vouches ADD COLUMN kind TEXT;
CREATE INDEX IF NOT EXISTS idx_vouches_kind ON vouches(kind);

-- Backfill vouches: existing vouches without kind treated as 'endorse'
UPDATE vouches SET kind = COALESCE(json_extract(record_json, '$.kind'), 'endorse') WHERE kind IS NULL;

-- Also relax the NOT NULL constraint on vouches.beacon (want-vouches may lack a project beacon)
-- SQLite doesn't support DROP NOT NULL via ALTER TABLE, so this is handled at the application layer.
-- New vouches inserts allow NULL beacon (see jetstream.js update).
