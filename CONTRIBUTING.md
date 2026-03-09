# Contributing to Vox Type

Thanks for contributing. This repository is kept intentionally lean, so changes should be focused, documented, and easy to validate.

## Before You Start

- Read the [README](./README.md) for project scope, requirements, and environment setup.
- Open an issue before starting larger changes so the direction is explicit.
- Keep credentials, `.env.local`, local history exports, and any other sensitive data out of Git.

## Development Setup

1. Copy [`.env.example`](./.env.example) to `.env.local`.
2. Install dependencies:

   ```bash
   npm ci --workspaces=false
   ```

3. Start the desktop app in development:

   ```bash
   npm run dev:desktop
   ```

Windows is required for the full end-to-end dictation flow, packaging, global hotkeys, and auto paste verification.

## Change Scope

- Prefer small pull requests with one clear purpose.
- Do not mix refactors, formatting churn, and behavior changes in the same PR unless they are tightly coupled.
- Update documentation when behavior, setup, or user-facing workflows change.

## Quality Gate

Run the relevant checks before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
```

Recommended additional checks for broader maintenance changes:

```bash
npm run deadcode
npm run deps:cycles
```

## Pull Requests

- Use a descriptive title and summarize the user-facing impact.
- Link the related issue when applicable.
- Include manual verification notes for Windows-only flows.
- Add screenshots or short recordings for visible UI changes when practical.

## Sensitive Data

- Never commit Azure credentials, `.env.local`, generated installers, local logs, or secure-storage exports.
- Replace secrets with placeholders in examples and screenshots.
- If you discover a security issue, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue with exploitable details.
