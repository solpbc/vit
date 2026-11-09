# changelog

## [0.6.8] - 2026-11-09

### Fixed

- security fix: `learn skill-{name}`, `remix`, and endorsement with `vouch` now refuse records changed since vetting. trust is tied to the record's URI and CID; older trust entries need re-vetting. the explicit `dangerous-accept` bypass is unchanged.

## [0.6.7] - 2026-11-04

### Fixed

- install messages now say `global`, and review instructions say `operator`. command flags and JSON fields keep their existing names.

## [0.6.6] - 2026-10-07

### Fixed

- Security fix: under Pi, `adopt` and `vet --dangerous-accept` now refuse agent execution. Regular `vet` uses the same review gate as other recognised agents.

### Added

- Pi can now run `init`, `skim`, `ship`, `remix`, and `learn` using its normal environment markers.

### Known limitations

- Pi-specific skill installation, doctor integration, and the Pi launcher for `vet --sandbox` remain unavailable.
