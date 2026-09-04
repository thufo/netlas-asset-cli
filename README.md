# Netlas Asset

[简体中文](README.zh-CN.md) · [Русский](README.ru.md) · English

Netlas Asset is a multilingual desktop and command-line client for focused, authorized lookups using the official Netlas API. The `desk-cli` branch is the Node.js/Electron edition; the Python edition remains on `main`.

## Features

- Host summaries for IP addresses and fully qualified domains.
- Netlas response searches with pagination and a local 200-result safety cap.
- Desktop interface with table/JSON views, JSON/JSONL/CSV export, request history, and favorites.
- English, Simplified Chinese, and Russian, with automatic locale detection and manual switching.
- Secure optional API-key persistence through the operating system credential backend.
- Windows and Linux builds for x64 and ARM64.

Use this software only for assets you own or are explicitly authorized to investigate.

## Desktop

Download the installer or portable package for your platform from [GitHub Releases](https://github.com/thufo/netlas-asset-cli/releases). Open **Settings**, enter a Netlas API key, and choose whether it should be stored securely. On Linux, persistence is disabled when no secure secret backend is available.

The result toolbar exports the current response as JSON, JSONL, or CSV. History stores request metadata only; it never stores API responses or API keys.

## CLI

```text
netlas-asset host TARGET [--timeout SECONDS] [--retries COUNT] [--format json|jsonl|csv] [--output PATH]
netlas-asset search QUERY [--limit 1..200] [--timeout SECONDS] [--retries COUNT] [--format json|jsonl|csv] [--output PATH]
```

Set the API key in the environment; there is deliberately no command-line key option that could leak into shell history.

```powershell
$env:NETLAS_API_KEY = "replace-with-your-api-key"
netlas-asset host example.com
netlas-asset search 'port:443 AND geo.country:US' --limit 40 --format csv --output results.csv
netlas-asset --lang zh-CN host 1.1.1.1
```

Optional variables: `NETLAS_BASE_URL`, plus `LC_ALL`, `LC_MESSAGES`, or `LANG` for locale detection.

## Development

```text
npm ci
npm run check
npm run dev
```

`npm run dist` builds desktop packages for the current platform and architecture. `npm run package:cli` builds a standalone CLI. A tag such as `v0.3.0` triggers the multi-platform workflow only when it matches the package version and belongs to `desk-cli`.

## Security and privacy

Network requests and credential operations run in the Electron main process. The renderer is sandboxed, has no Node.js integration, and communicates through a narrow typed preload API. See [SECURITY.md](SECURITY.md).

MIT License.
