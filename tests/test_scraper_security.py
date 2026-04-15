import sys
from unittest.mock import MagicMock

# Mock httpx to avoid ImportError in environment without dependencies
sys.modules["httpx"] = MagicMock()

import unittest
from execution.scraper import validate_url

class TestURLValidation(unittest.TestCase):
    def test_valid_urls(self):
        valid_urls = [
            "https://google.com",
            "http://example.com/foo/bar",
            "https://www.wikipedia.org"
        ]
        for url in valid_urls:
            try:
                self.assertEqual(validate_url(url), url)
            except ValueError as e:
                self.fail(f"Valid URL {url} raised ValueError: {e}")

    def test_invalid_scheme(self):
        invalid_schemes = [
            "ftp://example.com",
            "file:///etc/passwd",
            "gopher://example.com"
        ]
        for url in invalid_schemes:
            with self.assertRaises(ValueError):
                validate_url(url)

    def test_private_ips(self):
        private_urls = [
            "http://127.0.0.1",
            "http://localhost",
            "http://192.168.1.1",
            "http://10.0.0.1",
            "http://[::1]"
        ]
        for url in private_urls:
            with self.assertRaises(ValueError):
                validate_url(url)

if __name__ == '__main__':
    unittest.main()
