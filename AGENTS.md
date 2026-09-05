# Voice Note AI (VoxType) Governance

Project-local governance for the voice-note-ai repository.

## 1. Technical Standards
- Framework: Electron + Vite + React + TypeScript.
- Speech Engine: Azure Speech-to-Text SDK with low-latency push-to-talk.
- Tooling: `npm run build`, `npm run build:desktop`.

## 2. Quality & Validation
- Security: Never commit or hardcode Azure API keys; manage secrets via `.env` or secure keystore.
- Desktop stability: Verify IPC communication between Electron main process and renderer.
- Latency & UX: Maintain immediate audio capture feedback and reliable transcription rendering.
