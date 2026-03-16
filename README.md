# Vox Type

Windows-first desktop dictation app built with Electron, React, TypeScript, and Azure Speech-to-Text.

[![CI](https://github.com/Allysson-Rodrigues/voice-note-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Allysson-Rodrigues/voice-note-ai/actions/workflows/ci.yml)

See [`CHANGELOG.md`](./CHANGELOG.md) for release notes and recent changes.

## Overview

Vox Type captures microphone audio while a global hotkey is held, streams speech to Azure STT, post-processes the transcript, and injects the final text into the active Windows application. The app also includes a transparent HUD, configurable safety/privacy controls, optional local history, and adaptive language helpers.

## Core Capabilities

- Global push-to-talk dictation flow with hold-to-talk on Windows and fallback hotkeys when needed
- Streaming 16 kHz mono PCM transcription with Azure Speech-to-Text
- Automatic text insertion on Windows with clipboard-safe fallback paths
- Always-on-top transparent HUD for capture and status feedback
- Configurable hotkeys, session limits, formatting, rewrite, and confidence policies
- Optional local history with privacy mode and encrypted storage support where available
- Adaptive suggestions for protected terms, app-specific language bias, and formatting

## Architecture Snapshot

- `electron/main.ts` composes the desktop runtime, hotkeys, STT manager, settings, and IPC wiring.
- `electron/app-shell.ts` owns tray, HUD, display listeners, preload/icon resolution, and window-facing broadcast helpers.
- `electron/app-ipc.ts` centralizes application IPC handlers for settings, health checks, adaptive suggestions, dictionary, and history.
- `electron/app-stores.ts` provides lazy access to settings-adjacent persistence layers such as history, adaptive data, performance metrics, and Azure credential storage.
- `electron/modules/stt-session.ts` and `electron/modules/stt-session-support.ts` manage session lifecycle, provider prewarm, audio ownership checks, stop/finalize flow, and transcription completion metadata.
- `electron/modules/text-injection.ts` plus its support modules handle injection strategy selection, Win32 paste paths, clipboard preservation, and per-app method memory.
- `src/components/index/SettingsTab.tsx` is now a composition layer over focused settings sections for overview, capture, advanced controls, and Azure/security workflows.

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

Notes:

- The renderer development server is started by `vite`, while Electron watches and reloads the desktop process separately.
- Full end-to-end validation of hotkeys, auto paste, tray behavior, and packaging should be performed on Windows.

## Windows Packaging

Create the production desktop bundle:

```bash
npm run build:desktop
```

Create the Windows installer:

```bash
npm run dist:win
```

Packaging should be executed on Windows.

## Deployment & CI/CD (Azure DevOps)

This project is configured for automated builds and quality checks via Azure Pipelines.

- **Pipeline Configuration:** See [`azure-pipelines.yml`](./azure-pipelines.yml).
- **Environment Secrets:** For the pipeline to run correctly, you must configure the following variables in the **Azure DevOps Library** (Variable Group: `Global-Secrets`):
    - `AZURE_STT_KEY`: Your Azure Speech-to-Text key.
    - `AZURE_STT_REGION`: Your Azure region (e.g., `eastus`).
- **Artifacts:** Every successful build on `main` or `develop` produces a Windows `.exe` installer available in the Azure Pipelines "Artifacts" section.

For detailed connectivity instructions, refer to the [Connectivity Checklist](../../docs/operacao/azure-devops/CONNECTIVITY_CHECKLIST.md).

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

CI currently enforces `lint`, `typecheck`, `test`, and `format:check` on pushes and pull requests.

## Build and Packaging

The packaged application includes the renderer bundle, Electron main process, preload scripts, and required runtime assets declared in `package.json`.

## Repository Layout

```text
electron/     Electron runtime, IPC surface, persistence stores, and Windows integrations
src/          React renderer, tab UI, hooks, and shared frontend logic
public/       Runtime static assets packaged with the desktop app
scripts/      Small project maintenance scripts
assets/       Source assets used to generate app icons
```

## Repository Hygiene

- Keep the repository focused on source code, runtime assets, tests, and build/config files.
- Do not commit `.env.local`, generated bundles, installer outputs, or local scratch files.
- Treat Azure credentials, secure storage exports, and local history/adaptive data as sensitive.

## Collaboration

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- Use the GitHub issue templates for bugs and feature requests so reports are reproducible and triageable.
- Review [SECURITY.md](./SECURITY.md) before reporting vulnerabilities or sharing logs that may contain sensitive data.

## License

This project is licensed under `PolyForm Noncommercial 1.0.0`. Commercial use, resale, and other commercial exploitation are not permitted under this repository license. See [LICENSE](./LICENSE).
