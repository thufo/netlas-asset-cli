"""Command-line interface for Netlas Asset CLI."""

from __future__ import annotations

import argparse
import ipaddress
import math
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Sequence

from . import __version__
from .client import NetlasClient, NetlasError
from .output import render


DOMAIN_RE = re.compile(
    r"^(?=.{1,253}\.?$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$",
    re.IGNORECASE,
)


def positive_float(value: str) -> float:
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("value must be a finite number greater than zero")
    return number


def non_negative_int(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("value cannot be negative")
    return number


def result_limit(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "value must be an integer from 1 to 200"
        ) from exc
    if not 1 <= number <= 200:
        raise argparse.ArgumentTypeError("value must be an integer from 1 to 200")
    return number


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
    _add_request_arguments(host)
    _add_output_arguments(host)

    search = subparsers.add_parser("search", help="search Netlas public response data")
    search.add_argument("query", help="Netlas/Lucene query, quoted as one shell argument")
    search.add_argument("--limit", type=result_limit, default=20, metavar="1..200")
    _add_request_arguments(search)
    _add_output_arguments(search)

    return parser


def _add_request_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--timeout",
        type=positive_float,
        default=30.0,
        metavar="SECONDS",
        help="request timeout in seconds (default: 30)",
    )
    parser.add_argument(
        "--retries",
        type=non_negative_int,
        default=2,
        metavar="COUNT",
        help="retries for temporary API errors (default: 2)",
    )


def _add_output_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--format", choices=("json", "jsonl", "csv"), default="json")
    parser.add_argument("--output", type=Path, help="write results to a file instead of stdout")


def _write_output(text: str, path: Path | None) -> None:
    if path is None:
        sys.stdout.write(text)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as stream:
            stream.write(text)
            temporary_path = Path(stream.name)
        temporary_path.replace(path)
    except Exception:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    api_key = os.environ.get("NETLAS_API_KEY", "").strip()
    if not api_key:
        parser.error("NETLAS_API_KEY is not set")

    try:
        client = NetlasClient(
            api_key,
            base_url=os.environ.get("NETLAS_BASE_URL", "https://app.netlas.io"),
            timeout=args.timeout,
            max_retries=args.retries,
        )
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
