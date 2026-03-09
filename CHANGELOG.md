# Changelog

All notable changes to this project should be recorded here.

This file follows the spirit of `Keep a Changelog`, with emphasis on functional changes, fixes, security, and operational impact.

Historical entries below were reconstructed from the Git history available in this repository. Future entries should be updated at release time.

## [Unreleased]

### Changed

- Tightened privacy rules so history-derived phrase boosting is disabled whenever history is off or privacy mode is enabled.
- Restored the effective default behavior for `autoPasteEnabled` and `lowConfidencePolicy` during bootstrap and legacy settings migration, preserving the expected Windows auto-paste flow.
- Synced `package-lock.json` with `package.json`, keeping `tailwindcss-animate` in `devDependencies` and restoring compatibility with `npm ci`.
- Cleaned repository-facing documentation and removed obsolete migration analysis notes that no longer describe the active architecture.

### Security

- `adaptive.json` now supports encrypted persistence when `safeStorage` is available and history storage is configured as `encrypted`.
- The main logger now redacts sensitive transcript fields before writing to console sinks as well as the recent-log buffer.

### Tests

- Added regression coverage for privacy rules, adaptive store encryption/migration, and settings defaults.
- Added console redaction tests to ensure sensitive transcript data does not leak into logs.

## [1.0.4]

### Added

- Adaptive learning suggestions for protected terms, formatting style, and app-specific language bias.
- Secure Azure Speech credential storage with environment-variable fallback.
- New transcript-intent, transcript-rewrite, and Azure STT provider modules.

### Changed

- Refactored the STT session lifecycle, IPC validation, stores, and settings surface.
- Expanded test coverage across STT, window security, Azure credentials, capture, and post-processing.
- Updated the quality toolchain with `husky` and `lint-staged`.

## [1.0.3]

### Fixed

- Fixed audio worklet resolution for packaged builds.
- Corrected asset loading under `file://` in Electron packaging.
- Isolated development `userData` to reduce cache and lock conflicts.

### Changed

- Refined the HUD and restored wave animation during processing states.
- Revised setup, Windows installation, and packaging documentation.

## [Base v1]

### Added

- Core global push-to-talk dictation flow.
- Transparent always-on-top HUD.
- Automatic text insertion into the active application.
- Local transcription history.
- Hardening of the main session lifecycle and core application flow.
