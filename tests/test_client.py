import io
import json
import unittest
from email.message import Message
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from netlas_asset_cli.client import NetlasClient, NetlasError


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
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
    def test_host_summary_uses_bearer_auth_and_public_indices(self):
        opener = RecordingOpener([{"type": "domain", "domain": "example.com"}])
        client = NetlasClient("secret-key", base_url="https://example.test", opener=opener)

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
        opener = RecordingOpener(
            [http_error(429, retry_after=2), {"type": "domain", "domain": "example.com"}]
        )
        sleeps = []
        client = NetlasClient("secret", opener=opener, sleeper=sleeps.append)

        result = client.host_summary("example.com")

        self.assertEqual(result["domain"], "example.com")
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(sleeps, [2.0])

    def test_does_not_retry_authentication_error(self):
        opener = RecordingOpener([http_error(401, body=b'invalid token')])
        client = NetlasClient("secret", opener=opener, sleeper=lambda _: None)

        with self.assertRaisesRegex(NetlasError, "HTTP 401: invalid token"):
            client.host_summary("example.com")

        self.assertEqual(len(opener.requests), 1)

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


if __name__ == "__main__":
    unittest.main()
