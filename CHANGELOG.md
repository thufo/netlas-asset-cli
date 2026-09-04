# Changelog

All notable changes to this project are documented in this file.

## 0.3.0 - 2026-09-04

- Rewrite the project in Node.js 22 and TypeScript on the `desk-cli` branch.
- Add a sandboxed Electron desktop application with host lookup, response
  search, table/JSON views, JSON/JSONL/CSV export, history, and favorites.
- Add English, Simplified Chinese, and Russian interfaces with automatic locale
  detection and manual selection.
- Add optional OS-backed secure API-key persistence and refuse insecure Linux
  `basic_text` storage.
- Add update checks and user-confirmed updates for NSIS and AppImage packages.
- Build Windows and Linux desktop and standalone CLI artifacts for x64 and
  ARM64, with SHA256 checksums and tag-based GitHub Releases.
- Preserve bounded retries, `Retry-After`, pagination, timeout, cancellation,
  response validation, and atomic exports in the shared core.

## 0.2.0 - 2026-09-02

- Retry temporary Netlas API rate limits (`429`) and server errors (`5xx`).
- Honor numeric `Retry-After` headers with bounded delays.
- Add `netlas-asset --version`.
- Add continuous tests for supported Python versions.
- Publish repository and issue-tracker links in package metadata.

## 0.1.0 - 2026-08-24

- Initial public release with host summaries, response search, and JSON/JSONL/CSV output.
