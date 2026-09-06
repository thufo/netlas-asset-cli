# Changelog

All notable changes to this project are documented in this file.

## Unreleased

- Neutralize formula-like text in CSV headers and values to make exports safer
  to open in spreadsheet applications.
- Reject non-finite or incorrectly typed timeout, retry-count, and backoff
  settings before issuing a request.
- Bound HTTP error-body reads to prevent oversized gateway responses from
  consuming excessive memory while formatting diagnostics.
- Reject API keys containing whitespace, control characters, or non-ASCII text
  before constructing HTTP headers, without echoing the rejected value.
- Validate custom API base URLs before requests and report configuration errors
  without a traceback or accidental credential disclosure.
- Report concise `--limit` validation errors instead of printing all 200 valid
  choices.
- Redact API keys and normalize control characters in HTTP error details before
  printing them to terminals or CI logs.
- Retry transient connection failures and direct timeouts with the same bounded
  exponential backoff used for temporary HTTP errors.
- Support HTTP-date `Retry-After` headers used by some proxies and API gateways.
- Add per-command `--timeout` and `--retries` controls.
- Close HTTP error responses before retrying to avoid leaking network resources.
- Write file exports atomically to protect existing results from partial writes.

## 0.2.0 - 2026-09-02

- Retry temporary Netlas API rate limits (`429`) and server errors (`5xx`).
- Honor numeric `Retry-After` headers with bounded delays.
- Add `netlas-asset --version`.
- Add continuous tests for supported Python versions.
- Publish repository and issue-tracker links in package metadata.

## 0.1.0 - 2026-08-24

- Initial public release with host summaries, response search, and JSON/JSONL/CSV output.
