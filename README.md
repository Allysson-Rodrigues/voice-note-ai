# Vox Type

Windows-first desktop dictation app built with Electron, React, TypeScript, and Azure Speech-to-Text.

## Status

Active.

It captures microphone audio while the global hotkey is held, streams audio to Azure STT, and inserts the final transcript into the active app. The project also includes a transparent HUD, configurable settings, smart post-processing, and optional local history.

## Scope

- Platform: desktop, Windows-first
- Runtime: Electron + Vite + React
- Speech provider: Azure Speech-to-Text only
- Primary interaction: hold-to-talk global hotkey

## Main Features

- Global push-to-talk capture flow
- Streaming 16kHz mono PCM transcription with Azure STT
- Automatic text insertion on Windows with clipboard-safe fallback
- Always-on-top transparent HUD
- Configurable hotkey and session settings
- Smart text cleanup and dictionary fixes
- Optional local transcription history with privacy controls

## Requirements

- Node.js 20+ and npm
- Azure Speech resource with:
  - `AZURE_SPEECH_KEY`
  - `AZURE_SPEECH_REGION`
- Windows for the full desktop workflow and installer packaging

## Local Setup

1. Create `.env.local` from `.env.example`.
2. Install dependencies:

```bash
npm ci --workspaces=false
```

3. Start the desktop app in development:

```bash
npm run dev:desktop
```

## Environment

Base environment variables are documented in [`.env.example`](.env.example).

Most relevant variables:

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `AZURE_SPEECH_LANGUAGE`
- `VOICE_HOTKEY`
- `VOICE_HOTKEY_FALLBACK`
- `VOICE_HOLD_TO_TALK`
- `VOICE_AUTO_PASTE`
- `VOICE_HUD`
- `VOICE_MAX_SESSION_SECONDS`

For local development, `.env.local` remains supported.

For packaged Windows builds, Azure credentials can be configured either:

- in the app settings and stored with Electron `safeStorage`
- in OS environment variables as a fallback

Hotkey and session limits can also be changed at runtime from the settings screen. The `VOICE_*` values act as defaults for first boot.

## Validation

Run the core checks locally:

```bash
npm run lint
npm run typecheck
npm run test
npm run deadcode
```

Full quality gate:

```bash
npm run quality
```

## Build

Build renderer + Electron main process:

```bash
npm run build:desktop
```

Create a Windows installer:

```bash
npm run dist:win
```

Packaging should be executed on Windows.

## Repository Structure

```text
electron/     Electron main process, IPC, stores, Windows integrations
src/          React renderer, HUD UI, hooks, shared frontend logic
public/       Static assets required at runtime
scripts/      Small project maintenance scripts
assets/       Source assets used to generate app icons
```

## Notes

- This repository is intentionally focused on source code, runtime assets, tests, and build/config files required to review, run, and package the project.
- Local artifacts, playground files, and tool-specific leftovers are excluded from version control.
