import json
import unittest
from urllib.parse import parse_qs, urlsplit

from netlas_asset_cli.client import NetlasClient


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
        return FakeResponse(self.payloads.pop(0))


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


if __name__ == "__main__":
    unittest.main()
