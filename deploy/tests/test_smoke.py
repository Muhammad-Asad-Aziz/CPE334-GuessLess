"""Offline unit tests for deploy/smoke_test.py (network mocked).

Run (repo root): python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def response(self, base, path, data=None, token=None, method=None):
        return {
            '/api/v1/health': b'{"status":"ok","db":"ok","version":"abc"}',
            '/api/health': b'{"status":"ok","db":"ok","version":"abc"}',
            '/api/ready': b'{"status":"ready","db":"connected"}',
            '/': b'<!doctype html><html></html>',
            '/api/v1/auth/login': b'{"data":{"token":"test-session"}}',
            '/api/v1/auth/me': b'{"data":{"id":"u1","role":"RESPONDENT"}}',
            '/api/v1/available-surveys': b'{"data":[]}',
            '/api/v1/auth/logout': b'',
        }[path]

    @patch.dict('os.environ', {}, clear=True)
    def test_public_checks_pass_and_skip_optional_login(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            self.assertEqual(req.call_count, 4)

    @patch.dict('os.environ', {}, clear=True)
    def test_db_not_ready_fails_even_when_http_responds(self):
        def disconnected(base, path, **kwargs):
            return b'{"status":"not_ready","db":"disconnected"}' if path == '/api/ready' else self.response(base, path)
        with patch.object(smoke, 'request', side_effect=disconnected), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '/api/ready'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {'SMOKE_EMAIL': 'resp1@example.edu', 'SMOKE_PASSWORD': 'test-only'}, clear=True)
    def test_login_check_passes_and_logs_out(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            paths = [call.args[1] for call in req.call_args_list]
            self.assertIn('/api/v1/auth/login', paths)
            self.assertIn('/api/v1/auth/me', paths)
            self.assertIn('/api/v1/available-surveys', paths)
            self.assertEqual(paths[-1], '/api/v1/auth/logout')

    @patch.dict('os.environ', {'SMOKE_EMAIL': 'resp1@example.edu', 'SMOKE_PASSWORD': 'test-only'}, clear=True)
    def test_session_is_logged_out_even_if_me_fails(self):
        def broken_me(base, path, data=None, token=None, method=None):
            if path == '/api/v1/auth/me':
                raise ValueError('Broken response')
            return self.response(base, path, data, token, method)
        with patch.object(smoke, 'request', side_effect=broken_me) as req:
            with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
                smoke.check('https://demo.test')
            self.assertEqual(req.call_args.args[1], '/api/v1/auth/logout')


if __name__ == '__main__':
    unittest.main()