"""Command-line interface for Netlas Asset CLI."""

from __future__ import annotations

import argparse
import ipaddress
import os
import re
import sys
from pathlib import Path
from typing import Sequence

from . import __version__
from .client import NetlasClient, NetlasError
from .output import render


DOMAIN_RE = re.compile(
    r"^(?=.{1,253}\.?$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$",
    re.IGNORECASE,
)


def valid_target(value: str) -> str:
    target = value.strip()
    try:
        ipaddress.ip_address(target)
        return target
    except ValueError:
        pass
    if DOMAIN_RE.fullmatch(target):
        return target.rstrip(".").lower()
    raise argparse.ArgumentTypeError("TARGET must be an IP address or fully qualified domain")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="netlas-asset",
        description="Focused, authorized asset lookups using the official Netlas API.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    host = subparsers.add_parser("host", help="get an aggregated IP or domain summary")
    host.add_argument("target", type=valid_target)
    _add_output_arguments(host)

    search = subparsers.add_parser("search", help="search Netlas public response data")
    search.add_argument("query", help="Netlas/Lucene query, quoted as one shell argument")
    search.add_argument("--limit", type=int, default=20, choices=range(1, 201), metavar="1..200")
    _add_output_arguments(search)

    return parser


def _add_output_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--format", choices=("json", "jsonl", "csv"), default="json")
    parser.add_argument("--output", type=Path, help="write results to a file instead of stdout")


def _write_output(text: str, path: Path | None) -> None:
    if path is None:
        sys.stdout.write(text)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    api_key = os.environ.get("NETLAS_API_KEY", "").strip()
    if not api_key:
        parser.error("NETLAS_API_KEY is not set")

    client = NetlasClient(
        api_key,
        base_url=os.environ.get("NETLAS_BASE_URL", "https://app.netlas.io"),
    )

    try:
        if args.command == "host":
            result = client.host_summary(args.target)
        else:
            result = client.search_responses(args.query, limit=args.limit)
        _write_output(render(result, args.format), args.output)
        return 0
    except (NetlasError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
