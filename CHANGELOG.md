# Changelog

All notable changes to this project are documented in this file.

## 0.2.0 - 2026-09-02

- Retry temporary Netlas API rate limits (`429`) and server errors (`5xx`).
- Honor numeric `Retry-After` headers with bounded delays.
- Support HTTP-date `Retry-After` headers used by some proxies and API gateways.
- Add `netlas-asset --version`.
- Add continuous tests for supported Python versions.
- Publish repository and issue-tracker links in package metadata.

## 0.1.0 - 2026-08-24

- Initial public release with host summaries, response search, and JSON/JSONL/CSV output.
