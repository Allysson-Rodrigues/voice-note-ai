# Security Policy

## Supported Scope

This project is intended for local desktop dictation workflows and may process microphone input, clipboard operations, and locally stored settings. Reports related to credential handling, local storage, logging, text injection, and packaging are especially relevant.

## Reporting a Vulnerability

- Do not open a public issue with working exploits, secrets, or sensitive system details.
- Prefer GitHub private vulnerability reporting if it is enabled for this repository.
- If private reporting is not available, contact the maintainer through a private channel before disclosure.

Please include:

- affected version or commit
- impact summary
- reproduction steps
- environment details
- whether credentials, transcript history, or clipboard contents are exposed

## Sensitive Data Rules

- Never share Azure keys, `.env.local`, local transcript history, or secure-storage exports in a report.
- Redact tokens, machine identifiers, and private transcript content before sending logs or screenshots.

## Disclosure Expectations

The goal is coordinated disclosure. Please allow time for triage and remediation before publishing details.
