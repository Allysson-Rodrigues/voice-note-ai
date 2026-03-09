# Vox Type

Windows-first desktop dictation app built with Electron, React, TypeScript, and Azure Speech-to-Text.

See [`CHANGELOG.md`](./CHANGELOG.md) for release notes and recent changes.

## Overview

Vox Type captures microphone audio while a global hotkey is held, streams speech to Azure STT, post-processes the transcript, and injects the final text into the active Windows application. The app also includes a transparent HUD, configurable safety/privacy controls, optional local history, and adaptive language helpers.

## Core Capabilities

- Global push-to-talk dictation flow
- Streaming 16 kHz mono PCM transcription with Azure Speech-to-Text
- Automatic text insertion on Windows with clipboard-safe fallback paths
- Always-on-top transparent HUD for capture and status feedback
- Configurable hotkeys, session limits, formatting, rewrite, and confidence policies
- Optional local history with privacy mode and encrypted storage support where available
- Adaptive suggestions for protected terms, app-specific language bias, and formatting

## Tech Stack

- Electron for the desktop shell and Windows integrations
- React + Vite for the renderer and settings UI
- TypeScript across renderer and main process
- Vitest for web and Electron-side tests

## Requirements

- Node.js 20+
- npm
- Azure Speech resource with:
  - `AZURE_SPEECH_KEY`
  - `AZURE_SPEECH_REGION`
- Windows for the full desktop workflow, global hotkeys, auto paste, and packaging

## Getting Started

1. Create `.env.local` from [`.env.example`](./.env.example).
2. Install dependencies:

```bash
npm ci --workspaces=false
```

3. Start the desktop app in development:

```bash
npm run dev:desktop
```

## Environment Configuration

The baseline environment contract lives in [`.env.example`](./.env.example).

Most relevant variables:

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `AZURE_SPEECH_LANGUAGE`
- `VOICE_HOTKEY`
- `VOICE_HOTKEY_FALLBACK`
- `VOICE_HOLD_TO_TALK`
- `VOICE_AUTO_PASTE`
- `VOICE_LOW_CONFIDENCE_POLICY`
- `VOICE_HUD`
- `VOICE_MAX_SESSION_SECONDS`

Notes:

- `.env.local` is supported for local development only and must never be committed.
- Packaged Windows builds can store Azure credentials through Electron `safeStorage`, with environment variables as a fallback.
- `VOICE_*` variables act as first-boot defaults and can be overridden later in the settings UI.

## Quality Checks

Core validation:

```bash
npm run lint
npm run typecheck
npm run test
```

Additional maintenance checks:

```bash
npm run deadcode
npm run deps:cycles
npm run format:check
```

Full quality gate:

```bash
npm run quality
```

## Build and Packaging

Build renderer plus Electron main process:

```bash
npm run build:desktop
```

Create a Windows installer:

```bash
npm run dist:win
```

Packaging should be executed on Windows.

## Repository Layout

```text
electron/     Electron main process, IPC handlers, stores, and Windows integrations
src/          React renderer, HUD UI, hooks, and shared frontend logic
public/       Runtime static assets
scripts/      Small project maintenance scripts
assets/       Source assets used to generate app icons
```

## Repository Hygiene

- Keep the repository focused on source code, runtime assets, tests, and build/config files.
- Do not commit `.env.local`, generated bundles, installer outputs, or local scratch files.
- Treat Azure credentials, secure storage exports, and local history/adaptive data as sensitive.
