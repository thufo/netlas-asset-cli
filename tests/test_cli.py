import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from netlas_asset_cli.cli import _write_output, build_parser, main, valid_target


class BrokenStdout(io.StringIO):
    def write(self, value):
        raise BrokenPipeError


class CliTests(unittest.TestCase):
    def test_valid_target_normalizes_domain(self):
        self.assertEqual(valid_target("Example.COM."), "example.com")
        self.assertEqual(
            valid_target("B\N{LATIN CAPITAL LETTER U WITH DIAERESIS}CHER.Example."),
            "xn--bcher-kva.example",
        )

    def test_file_output_replaces_existing_file(self):
        with TemporaryDirectory() as directory:
            output_path = Path(directory) / "results.json"
            output_path.write_text("old", encoding="utf-8")

            _write_output("new", output_path)

            self.assertEqual(output_path.read_text(encoding="utf-8"), "new")
            self.assertEqual(list(Path(directory).iterdir()), [output_path])

    def test_dash_output_writes_to_stdout(self):
        output = io.StringIO()

        with redirect_stdout(output):
            _write_output("result\n", Path("-"))

        self.assertEqual(output.getvalue(), "result\n")

    def test_failed_atomic_replace_preserves_existing_file(self):
        with TemporaryDirectory() as directory:
            output_path = Path(directory) / "results.json"
            output_path.write_text("old", encoding="utf-8")

            with patch("pathlib.Path.replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    _write_output("new", output_path)

            self.assertEqual(output_path.read_text(encoding="utf-8"), "old")
            self.assertEqual(list(Path(directory).iterdir()), [output_path])

    def test_request_options_reject_invalid_values(self):
        parser = build_parser()
        invalid_options = [
            ("--timeout", "0"),
            ("--timeout", "nan"),
            ("--retries", "-1"),
        ]
        for option, value in invalid_options:
            with self.subTest(option=option, value=value):
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    parser.parse_args(["host", "example.com", option, value])

    def test_limit_reports_a_concise_range_error(self):
        parser = build_parser()
        for value in ("0", "201", "not-a-number"):
            with self.subTest(value=value):
                errors = io.StringIO()
                with redirect_stderr(errors), self.assertRaises(SystemExit):
                    parser.parse_args(["search", "port:443", "--limit", value])
                self.assertIn(
                    "value must be an integer from 1 to 200",
                    errors.getvalue(),
                )

        self.assertEqual(
            parser.parse_args(["search", "port:443", "--limit", "200"]).limit,
            200,
        )

    @patch.dict("os.environ", {"NETLAS_API_KEY": "test-key"}, clear=True)
    @patch("netlas_asset_cli.cli.NetlasClient")
    def test_main_passes_request_options_to_client(self, client_class):
        client_class.return_value.host_summary.return_value = {"domain": "example.com"}

        output = io.StringIO()
        with redirect_stdout(output):
            result = main(
                ["host", "example.com", "--timeout", "5.5", "--retries", "0"]
            )

        self.assertEqual(result, 0)
        client_class.assert_called_once_with(
            "test-key",
            base_url="https://app.netlas.io",
            timeout=5.5,
            max_retries=0,
        )
        self.assertIn('"domain": "example.com"', output.getvalue())

    @patch.dict("os.environ", {"NETLAS_API_KEY": "test-key"}, clear=True)
    @patch("netlas_asset_cli.cli.NetlasClient")
    def test_main_exits_cleanly_when_a_pipe_closes(self, client_class):
        client_class.return_value.host_summary.return_value = {"domain": "example.com"}
        errors = io.StringIO()

        with redirect_stdout(BrokenStdout()), redirect_stderr(errors):
            result = main(["host", "example.com"])

        self.assertEqual(result, 0)
        self.assertEqual(errors.getvalue(), "")

    @patch.dict(
        "os.environ",
        {"NETLAS_API_KEY": "test-key", "NETLAS_BASE_URL": "not-a-url"},
        clear=True,
    )
    def test_main_reports_invalid_base_url_without_a_traceback(self):
        errors = io.StringIO()

        with redirect_stderr(errors):
            result = main(["host", "example.com"])

        self.assertEqual(result, 1)
        self.assertEqual(
            errors.getvalue(),
            "error: base_url must use HTTPS (HTTP is allowed only for loopback hosts) "
            "and cannot contain credentials, a query, or a fragment\n",
        )

    @patch.dict("os.environ", {"NETLAS_API_KEY": "secret\nkey"}, clear=True)
    def test_main_does_not_echo_an_unsafe_api_key(self):
        errors = io.StringIO()

        with redirect_stderr(errors):
            result = main(["host", "example.com"])

        self.assertEqual(result, 1)
        self.assertEqual(
            errors.getvalue(),
            "error: A Netlas API key must contain only visible ASCII characters\n",
        )
        self.assertNotIn("secret", errors.getvalue())


if __name__ == "__main__":
    unittest.main()
