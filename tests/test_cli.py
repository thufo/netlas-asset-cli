import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from netlas_asset_cli.cli import build_parser, main, valid_target


class CliTests(unittest.TestCase):
    def test_valid_target_normalizes_domain(self):
        self.assertEqual(valid_target("Example.COM."), "example.com")

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


if __name__ == "__main__":
    unittest.main()
