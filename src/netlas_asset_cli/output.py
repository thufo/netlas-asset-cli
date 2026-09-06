"""Output helpers for JSON, JSON Lines, and CSV."""

from __future__ import annotations

import csv
import io
import json
from typing import Any, Dict, List


def _records(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list) and all(isinstance(item, dict) for item in value):
        return value
    raise ValueError("Output must be a mapping or a list of mappings")


def _csv_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if value is None:
        return ""
    if isinstance(value, str) and (
        value.startswith(("\t", "\r", "\n"))
        or value.lstrip().startswith(("=", "+", "-", "@"))
    ):
        return f"'{value}"
    return value


def render(value: Any, output_format: str) -> str:
    """Serialize a mapping or list of mappings."""

    if output_format == "json":
        return json.dumps(value, ensure_ascii=False, indent=2) + "\n"

    records = _records(value)
    if output_format == "jsonl":
        return "".join(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
            for record in records
        )

    if output_format == "csv":
        if not records:
            return ""
        fieldnames: List[str] = []
        seen = set()
        for record in records:
            for key in record:
                if key not in seen:
                    seen.add(key)
                    fieldnames.append(key)
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow([_csv_value(key) for key in fieldnames])
        for record in records:
            writer.writerow([_csv_value(record.get(key)) for key in fieldnames])
        return stream.getvalue()

    raise ValueError(f"Unsupported output format: {output_format}")
