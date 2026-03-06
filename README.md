# Vox Type (Windows-first, personal use)

Universal dictation app (Electron) with a global hotkey that:

- starts/stops microphone capture
- streams 16kHz mono PCM to Azure Speech-to-Text
- copies final text to the clipboard
- on Windows, tries automatic paste via `WM_PASTE` (target/foreground handle), with `Ctrl+V` and `Shift+Insert` fallback
- shows an always-on-top transparent HUD window (`hud.html`) above the taskbar, centered at the bottom of the active display
- keeps local history with optional privacy mode and encrypted storage

## Setup (dev)

1. Create a `.env.local` file (use `.env.example` as a base)

2. Install dependencies and run:

```bash
npm ci --workspaces=false
npm run dev:desktop
```

## STT provider

This project runs only with Azure Speech-to-Text.

## Azure config for installed app (.exe)

For the installed Windows app, configure variables in the OS environment (not only in `.env.local`):

1. Open **Edit the system environment variables**.
2. In **User variables**, add/edit:
   - `AZURE_SPEECH_KEY`
   - `AZURE_SPEECH_REGION` (for example: `brazilsouth`)
   - optional: `AZURE_SPEECH_LANGUAGE=pt-BR`
3. Fully close the app from tray (**Quit**) and sign out/sign in again (or restart Windows Explorer).
4. Reopen the app and run **Health Check** from the **Capture** tab.

Note: in the packaged `.exe`, `.env.local` is not the most reliable runtime source for end-user variables.

## Quality Gate (clean code)

```bash
# recommended local/CI gate (lint + typecheck + coverage + cycles + orphan files)
npm run quality

# strict version (includes prettier across the whole repo)
npm run quality:strict
```

## Build Windows installer (.exe)

Prerequisites:

- Run packaging on **Windows** (PowerShell/CMD), not pure Linux.
- Node.js + npm installed.
- Dependencies installed (`npm ci --workspaces=false`).
- Azure variables configured in the Windows environment (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`).

Commands:

```bash
# build app (renderer + electron main)
npm run build:desktop

# generate NSIS installer in release/
npm run dist:win
```

Important:

- Run commands inside the project folder (where `package.json` exists), for example:

```powershell
cd C:\Users\allys\dev\voice-note-ai
```

Expected output (`release/` folder):

- `Vox Type-Setup-1.0.3.exe`
- auxiliary artifacts (`latest.yml`, `.blockmap`) for future auto-update

Notes:

- The installer performs in-place upgrade (same `appId`/`productName`).
- Without code signing, Windows SmartScreen may show a warning. For broad distribution, use code signing.
- To run the installer from PowerShell, use quotes because of spaces in filename:

```powershell
& ".\release\Vox Type-Setup-1.0.3.exe"
```

## Version update (patch/minor/major)

Recommended flow:

```bash
# 1) bump version without creating git tag automatically
npm version patch --no-git-tag-version

# 2) validate quality
npm run quality

# 3) generate new installer
npm run dist:win
```

Update notes:

- Install the new version over the current one (NSIS upgrade).
- Before major changes, back up `%APPDATA%\voice-note-ai\settings.json`, `%APPDATA%\voice-note-ai\dictionary.json`, and `%APPDATA%\voice-note-ai\history.json`.

## Hotkey / behavior

- Default hotkey: `Ctrl+Win` (`CommandOrControl+Super`)
- On non-Windows platforms, there is fallback to `Ctrl+Win+Space` (`CommandOrControl+Super+Space`) if primary fails
- Customize:
  - `VOICE_HOTKEY="CommandOrControl+Super"`
  - `VOICE_HOTKEY_FALLBACK="CommandOrControl+Super+Space"`
- Hold-to-talk:
  - enabled by default (`VOICE_HOLD_TO_TALK=1`) on Windows with `uiohook-napi`
  - on Windows, if hook fails to load, capture is blocked (no toggle fallback)
  - default uses modifiers (`Ctrl + Win`) without fixed keycode
  - if needed, force keycodes via `VOICE_HOLD_KEYCODES` (example: `29,3675`)
- Auto-paste (Windows):
  - recommended default: enabled (`VOICE_AUTO_PASTE=1`)
  - `VOICE_AUTO_PASTE` defines initial default when local settings do not exist yet
  - flow uses mutex + safe clipboard restore (does not overwrite fresh user clipboard data)

## Writing style and smart fixes

- Tone profiles:
  - `formal`: stronger punctuation/normalization
  - `casual`: balance between natural tone and readability
  - `very-casual`: preserves colloquial tone with lighter formalization
- App applies canonical post-STT fixes (example: `workspace -> Workspace`, `antigravity -> Antigravity`).
- You can tune these rules in **Dictionary > Smart fixes**.

## Hotkey troubleshooting (Windows)

- If hotkey registration fails, app shows the current reason.
- If `uiohook-napi` fails on Windows, app shows error and blocks capture until fixed.
- Run app as administrator to test privilege conflict.
- Check for other global shortcuts using `Ctrl+Win`.
- Enable `VOICE_HOLD_KEYCODES` only if layout/keyboard does not behave well with modifier detection.

## Build/install troubleshooting (Windows)

- `npm ERR! enoent ... package.json`: wrong directory; `cd` to project path first.
- `release\Voice ... could not be loaded`: in PowerShell, run `.exe` with `&` and quoted path.
- `Capture failed: Unable to load a worklet's module.`: generate updated installer (`npm run build:desktop && npm run dist:win`) and reinstall over current version.

## Latency and reliability

- App keeps balanced latency profile (`stopGraceMs=200`).
- Session timeout: `90s` (configurable in settings store).
- Automatic STT retry: 1 retry for recoverable failures in short sessions (<30s), replaying local audio buffer.
- Telemetry in logs:
  - `ptt_to_first_partial_ms`
  - `ptt_to_final_ms`
  - `inject_total_ms`
  - `resolve_window_ms`
  - `paste_attempt_ms`
  - `clipboard_restore_ms`
  - `retry_count`
  - `session_duration_ms`

## Local history

- App stores final transcriptions locally (**History** tab) by default.
- Default settings:
  - history enabled
  - retention: 30 days
- Optional protections:
  - **Privacy mode** disables local history persistence
  - **Encrypted** history storage uses `safeStorage` when available
- Supported operations:
  - text search
  - copy transcription
  - delete single item
  - clear full history
- Persistence path: `%APPDATA%\voice-note-ai\history.json`

## Formatting commands (PT+EN)

- Post-processing understands explicit commands:
  - `bullet point` / `bullet` / `tópico` / `topico` -> `•`
  - `item 1` / `número 1` / `numero 1` / `number 1` -> `1.`
  - `nova linha` / `new line` -> line break
  - `abre colchetes` / `fecha colchetes` -> `[` / `]`
  - `travessão` / `travessao` -> `—`
  - `ponto final` -> `.`
- Feature can be enabled/disabled in **Settings**.

## App icon

- Icon source: `assets/icons/app-icon.svg`
- Generate icons:

```bash
npm run icons:generate
```

- Output:
  - `public/favicon.png`
  - `public/favicon.ico`

## Sync from WSL to Windows

In WSL:

```bash
cd /home/allysson/projetos/01-projetos/voice-note-ai
rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude dist \
  --exclude electron-dist \
  --exclude .env.local \
  ./ /mnt/c/Users/allys/dev/voice-note-ai/
```

On Windows (PowerShell or CMD):

```bash
cd C:\Users\allys\dev\voice-note-ai
npm ci --workspaces=false
npm run dev:desktop
```

Post-sync checklist:

- hotkey `Ctrl+Win` enters `Listening`, then `Finalizing` -> `Idle` on release
- on Windows, global hook loads without blocking capture
- HUD stays above other apps
- dictation works in Notepad/Slack/VS Code

## "Will this look hacky?"

- In common apps (Notepad, Slack, Chrome), it usually works well.
- Two areas may look suspicious:
  1. **Global keyboard hook** (can look like keylogger behavior to some antivirus tools, even though this app only detects the hotkey chord).
  2. **Auto-paste** (`Ctrl+V` simulation) may fail in protected/restricted windows.
- Therefore MVP keeps a safe fallback: **always copy to clipboard**; auto-paste is optional.

## STT provider (env vars)

- Azure:
  - `AZURE_SPEECH_KEY`
  - `AZURE_SPEECH_REGION`
  - optional: `AZURE_SPEECH_LANGUAGE` (default: `pt-BR`)
  - optional: `VOICE_PHRASES` (comma-separated hints for slang/English/app names)
- `VOICE_HUD` (default: `1`) shows always-on-top indicator centered near the bottom edge of the current display
- `VOICE_HUD_DEBUG=1` turns HUD into normal debug window (frame/devtools)
- `VOICE_MAX_SESSION_SECONDS` (default: `90`)
- `VOICE_HISTORY_ENABLED` (default: `1`) enables local history
- `VOICE_HISTORY_RETENTION_DAYS` (default: `30`) history retention
