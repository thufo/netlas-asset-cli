# Netlas Asset CLI

Netlas Asset CLI is a small, dependency-free Python command-line tool for
authorized external asset discovery. It uses the official Netlas API to:

- retrieve an aggregated summary for an IP address or domain;
- search public internet-scan response data with Netlas query syntax;
- export results as JSON, JSON Lines, or CSV for further analysis.
- retry temporary API rate limits, service errors, connection failures, and
  timeouts with bounded backoff.

The project is intentionally compact so it can be reviewed, extended, and
integrated into defensive security workflows.

## Responsible use

Use this tool only for assets you own, administer, or have explicit permission
to assess. The tool only queries data already indexed by Netlas; it does not
actively scan a target. You are responsible for following Netlas terms and all
applicable laws.

## Requirements

- Python 3.9 or newer
- A Netlas account and API key

The API key is read from `NETLAS_API_KEY`. It is never written to output files
or logs by this tool.

File output uses an atomic replacement, so an interrupted write does not leave
an existing export partially overwritten.

CSV exports prefix text cells that spreadsheet programs could interpret as
formulas with an apostrophe. Use JSON or JSON Lines when exact text preservation
is required.

## Install

Clone the repository and install it in an isolated environment:

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
$env:NETLAS_API_KEY = 'replace-with-your-api-key'
```

Linux and macOS:

```bash
source .venv/bin/activate
python -m pip install -e .
export NETLAS_API_KEY='replace-with-your-api-key'
```

## Examples

Get the current Netlas summary for an IP or domain:

```bash
netlas-asset host example.com
netlas-asset host 1.1.1.1 --format csv --output host.csv
```

Search public response data. Quote the query so the shell passes it as one
argument:

```bash
netlas-asset search 'host:example.com' --limit 20
netlas-asset search 'geo.country:US AND port:443' --limit 40 --format jsonl
netlas-asset search 'http.title.keyword:"Example Domain"' --format csv --output results.csv
netlas-asset host example.com --timeout 10 --retries 1
netlas-asset --version
```

The default result limit is 20 and the local safety cap is 200. This keeps the
tool suitable for focused research and free/community API plans.

Temporary HTTP `429` and `5xx` responses are retried twice. The client honors
both numeric and HTTP-date `Retry-After` headers and otherwise uses a short
exponential backoff.

## Commands

```text
netlas-asset host TARGET [--timeout SECONDS] [--retries COUNT] [--format json|jsonl|csv] [--output PATH]
netlas-asset search QUERY [--limit 1..200] [--timeout SECONDS] [--retries COUNT] [--format json|jsonl|csv] [--output PATH]
```

Omit `--output` to print results normally, or pass `--output -` when a script
needs to select standard output explicitly.

Set `NETLAS_BASE_URL` only when testing against a compatible API endpoint. The
default is the official `https://app.netlas.io` service.

## Development

The test suite uses only Python's standard library and never contacts Netlas:

```bash
python -m unittest discover -s tests -v
```

## API references

- [Netlas API reference](https://docs.netlas.io/api-reference/)
- [Netlas search query language](https://docs.netlas.io/knowledge-base/query-language/)

## License

MIT
