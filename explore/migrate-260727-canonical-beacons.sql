-- Migration: canonicalize known beacon aliases and rebuild beacon aggregates
-- Run: wrangler d1 execute vit-explore --remote --file=explore/migrate-260727-canonical-beacons.sql

UPDATE beacons
SET last_activity = MAX(
  last_activity,
  (SELECT last_activity FROM beacons WHERE name = 'https://tangled.org/solpbc.org/rookery')
)
WHERE name = 'vit:tangled.org/solpbc.org/rookery'
  AND EXISTS (
    SELECT 1 FROM beacons WHERE name = 'https://tangled.org/solpbc.org/rookery'
  );

UPDATE beacons
SET last_activity = MAX(
  last_activity,
  (SELECT last_activity FROM beacons WHERE name = 'https://github.com/solpbc/thermals')
)
WHERE name = 'vit:github.com/solpbc/thermals'
  AND EXISTS (
    SELECT 1 FROM beacons WHERE name = 'https://github.com/solpbc/thermals'
  );

UPDATE beacons
SET last_activity = MAX(
  last_activity,
  (SELECT last_activity FROM beacons WHERE name = 'https://github.com/osaurus-ai/vmlx-swift')
)
WHERE name = 'vit:github.com/osaurus-ai/vmlx-swift'
  AND EXISTS (
    SELECT 1 FROM beacons WHERE name = 'https://github.com/osaurus-ai/vmlx-swift'
  );

UPDATE caps
SET beacon = CASE beacon
  WHEN 'https://tangled.org/solpbc.org/rookery' THEN 'vit:tangled.org/solpbc.org/rookery'
  WHEN 'https://github.com/solpbc/thermals' THEN 'vit:github.com/solpbc/thermals'
  WHEN 'https://github.com/osaurus-ai/vmlx-swift' THEN 'vit:github.com/osaurus-ai/vmlx-swift'
END
WHERE beacon IN (
  'https://tangled.org/solpbc.org/rookery',
  'https://github.com/solpbc/thermals',
  'https://github.com/osaurus-ai/vmlx-swift'
);

UPDATE vouches
SET beacon = CASE beacon
  WHEN 'https://tangled.org/solpbc.org/rookery' THEN 'vit:tangled.org/solpbc.org/rookery'
  WHEN 'https://github.com/solpbc/thermals' THEN 'vit:github.com/solpbc/thermals'
  WHEN 'https://github.com/osaurus-ai/vmlx-swift' THEN 'vit:github.com/osaurus-ai/vmlx-swift'
END
WHERE beacon IN (
  'https://tangled.org/solpbc.org/rookery',
  'https://github.com/solpbc/thermals',
  'https://github.com/osaurus-ai/vmlx-swift'
);

UPDATE beacons
SET cap_count = (
      SELECT COUNT(*) FROM caps WHERE caps.beacon = beacons.name
    ),
    vouch_count = (
      SELECT COUNT(*) FROM vouches WHERE vouches.beacon = beacons.name
    )
WHERE name IN (
  'vit:tangled.org/solpbc.org/rookery',
  'vit:github.com/solpbc/thermals',
  'vit:github.com/osaurus-ai/vmlx-swift'
)
  AND (
    cap_count != (SELECT COUNT(*) FROM caps WHERE caps.beacon = beacons.name)
    OR vouch_count != (SELECT COUNT(*) FROM vouches WHERE vouches.beacon = beacons.name)
  );

DELETE FROM beacons
WHERE name IN (
  'https://tangled.org/solpbc.org/rookery',
  'https://github.com/solpbc/thermals',
  'https://github.com/osaurus-ai/vmlx-swift'
);
