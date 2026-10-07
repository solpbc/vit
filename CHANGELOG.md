# changelog

## [0.6.6] - 2026-10-07

### Fixed

- Security fix: under Pi, `adopt` and `vet --dangerous-accept` now refuse agent execution. Regular `vet` uses the same review gate as other recognised agents.

### Added

- Pi can now run `init`, `skim`, `ship`, `remix`, and `learn` using its normal environment markers.

### Known limitations

- Pi-specific skill installation, doctor integration, and the Pi launcher for `vet --sandbox` remain unavailable.
