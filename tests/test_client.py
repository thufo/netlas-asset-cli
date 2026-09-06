import io
import json
import unittest
from datetime import datetime, timezone
from email.message import Message
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit

from netlas_asset_cli.client import NetlasClient, NetlasError


class RecordingBytesIO(io.BytesIO):
    def __init__(self, value):
        super().__init__(value)
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        return super().read(size)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        if isinstance(self.payload, bytes):
            return self.payload
        return json.dumps(self.payload).encode("utf-8")


class RecordingOpener:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        result = self.payloads.pop(0)
        if isinstance(result, Exception):
            raise result
        return FakeResponse(result)


def http_error(status, *, retry_after=None, body=b""):
    headers = Message()
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return HTTPError(
        "https://example.test/api/host/example.com/",
        status,
        "test error",
        headers,
        io.BytesIO(body),
    )


class NetlasClientTests(unittest.TestCase):
    def test_rejects_invalid_json_responses(self):
        for raw_response in (b"{not-json", b"\xff"):
            with self.subTest(raw_response=raw_response):
                client = NetlasClient(
                    "secret",
                    opener=RecordingOpener([raw_response]),
                )

                with self.assertRaisesRegex(
                    NetlasError,
                    "Netlas returned an invalid JSON response",
                ):
                    client.host_summary("example.com")

    def test_rejects_unexpected_host_response_shape(self):
        client = NetlasClient("secret", opener=RecordingOpener([["unexpected"]]))

        with self.assertRaisesRegex(NetlasError, "Unexpected host response type"):
            client.host_summary("example.com")

    def test_rejects_unexpected_search_response_shape(self):
        client = NetlasClient(
            "secret",
            opener=RecordingOpener([{"items": "unexpected"}]),
        )

        with self.assertRaisesRegex(NetlasError, "Unexpected search response type"):
            client.search_responses("port:443")

    def test_rejects_invalid_request_policy_settings(self):
        timeout_message = "timeout must be a finite number greater than zero"
        retries_message = "max_retries must be a non-negative integer"
        invalid_settings = (
            ({"timeout": 0}, timeout_message),
            ({"timeout": float("nan")}, timeout_message),
            ({"timeout": float("inf")}, timeout_message),
            ({"timeout": True}, timeout_message),
            ({"max_retries": -1}, retries_message),
            ({"max_retries": 1.5}, retries_message),
            ({"max_retries": True}, retries_message),
            (
                {"retry_backoff": float("nan")},
                "retry_backoff must be a finite non-negative number",
            ),
            (
                {"retry_backoff": -0.1},
                "retry_backoff must be a finite non-negative number",
            ),
        )
        for settings, message in invalid_settings:
            with self.subTest(settings=settings), self.assertRaisesRegex(
                ValueError,
                message,
            ):
                NetlasClient("secret", **settings)

    def test_rejects_api_keys_that_are_unsafe_for_http_headers(self):
        invalid_api_keys = (
            "secret\nkey",
            "secret key",
            "s\N{LATIN SMALL LETTER E WITH ACUTE}cret",
        )
        for api_key in invalid_api_keys:
            with self.subTest(api_key=api_key), self.assertRaisesRegex(
                ValueError,
                "only visible ASCII characters",
            ):
                NetlasClient(api_key)

    def test_rejects_malformed_or_unsafe_base_urls(self):
        invalid_urls = (
            "example.test",
            "ftp://example.test",
            "https://user:password@example.test",
            "https://example.test?token=secret",
            "https://example.test/#fragment",
            "https://example.test:99999",
        )
        for base_url in invalid_urls:
            with self.subTest(base_url=base_url), self.assertRaisesRegex(
                ValueError,
                r"base_url must be an HTTP\(S\) URL",
            ):
                NetlasClient("secret-key", base_url=base_url)

    def test_host_summary_uses_bearer_auth_and_public_indices(self):
        opener = RecordingOpener([{"type": "domain", "domain": "example.com"}])
        client = NetlasClient("secret-key", base_url="https://example.test/", opener=opener)

        result = client.host_summary("example.com")

        self.assertEqual(result["domain"], "example.com")
        request, timeout = opener.requests[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-key")
        self.assertEqual(timeout, 30.0)
        parsed = urlsplit(request.full_url)
        self.assertEqual(parsed.path, "/api/host/example.com/")
        self.assertEqual(parse_qs(parsed.query), {"public_indices_only": ["true"]})

    def test_search_paginates_and_extracts_data(self):
        first_page = {
            "items": [
                {"data": {"host": f"192.0.2.{index}"}, "highlight": {}}
                for index in range(1, 21)
            ]
        }
        second_page = {"items": [{"data": {"host": "192.0.2.21"}}]}
        opener = RecordingOpener([first_page, second_page])
        client = NetlasClient("secret-key", base_url="https://example.test", opener=opener)

        results = client.search_responses("port:443", limit=21)

        self.assertEqual(len(results), 21)
        self.assertEqual(results[-1]["host"], "192.0.2.21")
        second_request, _ = opener.requests[1]
        self.assertEqual(parse_qs(urlsplit(second_request.full_url).query)["start"], ["20"])

    def test_search_rejects_excessive_local_limit(self):
        client = NetlasClient("secret", opener=RecordingOpener([]))
        with self.assertRaises(ValueError):
            client.search_responses("port:443", limit=201)

    def test_retries_rate_limit_and_honors_retry_after(self):
        rate_limit_error = http_error(429, retry_after=2)
        opener = RecordingOpener(
            [rate_limit_error, {"type": "domain", "domain": "example.com"}]
        )
        sleeps = []
        client = NetlasClient("secret", opener=opener, sleeper=sleeps.append)

        result = client.host_summary("example.com")

        self.assertEqual(result["domain"], "example.com")
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(sleeps, [2.0])
        self.assertTrue(rate_limit_error.fp is None or rate_limit_error.fp.closed)

    def test_does_not_retry_authentication_error(self):
        opener = RecordingOpener([http_error(401, body=b'invalid token')])
        client = NetlasClient("secret", opener=opener, sleeper=lambda _: None)

        with self.assertRaisesRegex(NetlasError, "HTTP 401: invalid token"):
            client.host_summary("example.com")

        self.assertEqual(len(opener.requests), 1)

    def test_limits_error_body_reads(self):
        body = RecordingBytesIO(b"x" * 10_000)
        error = HTTPError(
            "https://example.test/api/host/example.com/",
            400,
            "test error",
            Message(),
            body,
        )
        client = NetlasClient("secret", opener=RecordingOpener([error]))

        with self.assertRaises(NetlasError):
            client.host_summary("example.com")

        self.assertEqual(body.read_sizes, [4096])

    def test_redacts_api_key_and_control_characters_from_error_detail(self):
        opener = RecordingOpener(
            [http_error(403, body=b"rejected secret-key\nupstream\ttrace")]
        )
        client = NetlasClient("secret-key", opener=opener)

        with self.assertRaisesRegex(
            NetlasError,
            r"HTTP 403: rejected \[REDACTED\] upstream trace",
        ):
            client.host_summary("example.com")

    def test_retries_server_error_with_exponential_backoff(self):
        opener = RecordingOpener(
            [http_error(503), http_error(503), {"type": "domain", "domain": "example.com"}]
        )
        sleeps = []
        client = NetlasClient(
            "secret",
            opener=opener,
            sleeper=sleeps.append,
            retry_backoff=0.25,
        )

        client.host_summary("example.com")

        self.assertEqual(len(opener.requests), 3)
        self.assertEqual(sleeps, [0.25, 0.5])

    def test_retries_transient_network_error_with_backoff(self):
        opener = RecordingOpener(
            [URLError("connection reset"), {"type": "domain", "domain": "example.com"}]
        )
        sleeps = []
        client = NetlasClient("secret", opener=opener, sleeper=sleeps.append)

        result = client.host_summary("example.com")

        self.assertEqual(result["domain"], "example.com")
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(sleeps, [0.5])

    def test_redacts_api_key_from_final_network_error(self):
        opener = RecordingOpener([URLError("connection rejected secret-key\ntrace")])
        client = NetlasClient("secret-key", opener=opener, max_retries=0)

        with self.assertRaisesRegex(
            NetlasError,
            r"Could not reach Netlas: connection rejected \[REDACTED\] trace",
        ):
            client.host_summary("example.com")

    def test_retries_direct_timeout(self):
        opener = RecordingOpener(
            [TimeoutError(), {"type": "domain", "domain": "example.com"}]
        )
        sleeps = []
        client = NetlasClient("secret", opener=opener, sleeper=sleeps.append)

        result = client.host_summary("example.com")

        self.assertEqual(result["domain"], "example.com")
        self.assertEqual(sleeps, [0.5])

    def test_honors_http_date_retry_after(self):
        retry_at = "Thu, 03 Sep 2026 01:30:00 GMT"
        now = datetime(2026, 9, 3, 1, 29, 50, tzinfo=timezone.utc).timestamp()
        opener = RecordingOpener(
            [http_error(503, retry_after=retry_at), {"type": "domain", "domain": "example.com"}]
        )
        sleeps = []
        client = NetlasClient(
            "secret",
            opener=opener,
            sleeper=sleeps.append,
            clock=lambda: now,
        )

        client.host_summary("example.com")

        self.assertEqual(sleeps, [10.0])


if __name__ == "__main__":
    unittest.main()
