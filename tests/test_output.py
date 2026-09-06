import csv
import io
import json
import unittest

from netlas_asset_cli.output import render


class OutputTests(unittest.TestCase):
    def test_jsonl_renders_one_record_per_line(self):
        text = render([{"host": "192.0.2.1"}, {"host": "192.0.2.2"}], "jsonl")
        records = [json.loads(line) for line in text.splitlines()]
        self.assertEqual(records[1]["host"], "192.0.2.2")

    def test_csv_serializes_nested_values_as_json(self):
        text = render([{"host": "192.0.2.1", "ports": [80, 443]}], "csv")
        row = next(csv.DictReader(io.StringIO(text)))
        self.assertEqual(row["host"], "192.0.2.1")
        self.assertEqual(json.loads(row["ports"]), [80, 443])

    def test_csv_neutralizes_spreadsheet_formulas(self):
        text = render(
            [
                {
                    "=unsafe-header": "=1+1",
                    "leading-space": "  @command",
                    "leading-tab": "\tformula",
                    "number": -2,
                }
            ],
            "csv",
        )

        header, row = list(csv.reader(io.StringIO(text)))
        self.assertEqual(header[0], "'=unsafe-header")
        self.assertEqual(row, ["'=1+1", "'  @command", "'\tformula", "-2"])


if __name__ == "__main__":
    unittest.main()
