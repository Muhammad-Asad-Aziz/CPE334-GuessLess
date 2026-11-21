"""Public deployment smoke checks for GuessLess. Credentials/tokens are never printed.

Usage:
    python3 deploy/smoke_test.py SERVICE_URL

Checks (in order):
  1. GET /api/v1/health -> {"status": "ok", "db": "ok"}
  2. GET /api/health    -> {"status": "ok"}
  3. GET /api/ready     -> {"db": "connected"}
  4. GET /              -> HTML page (built React SPA)
  5. OPTIONAL login     -> POST /api/v1/auth/login, GET /api/v1/auth/me
     (plus read-only GET /api/v1/available-surveys if role == RESPONDENT),
     then POST /api/v1/auth/logout in finally. Runs only when BOTH
     SMOKE_EMAIL and SMOKE_PASSWORD are set.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request


def request(base, path, data=None, token=None, method=None):
    headers = {}
    body = None
    if data is not None:
        headers['Content-Type'] = 'application/json'
        body = json.dumps(data).encode()
    elif method == 'POST':
        body = b''
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, headers=headers, data=body, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def check(base):
    for path, predicate in (
        ('/api/v1/health', lambda b: json.loads(b).get('status') == 'ok' and json.loads(b).get('db') == 'ok'),
        ('/api/health', lambda b: json.loads(b).get('status') == 'ok'),
        ('/api/ready', lambda b: json.loads(b).get('db') == 'connected'),
        ('/', lambda b: b'<html' in b.lower()),
    ):
        for attempt in range(5):
            try:
                if not predicate(request(base, path)):
                    raise ValueError('Unexpected response')
                break
            except (urllib.error.URLError, TimeoutError, ValueError):
                if attempt == 4:
                    raise RuntimeError('Smoke check failed: ' + path) from None
                time.sleep(3)
        print('PASS ' + path)

    email, password = os.getenv('SMOKE_EMAIL'), os.getenv('SMOKE_PASSWORD')
    if bool(email) != bool(password):
        raise RuntimeError('Set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither.')
    if not email:
        print('SKIP login: optional smoke credentials not configured')
        return

    token = None
    try:
        login = json.loads(request(base, '/api/v1/auth/login', {'email': email, 'password': password}))
        token = login['data']['token']
        me = json.loads(request(base, '/api/v1/auth/me', token=token))
        if not me.get('data', {}).get('id'):
            raise ValueError('Missing user id in /api/v1/auth/me')
        print('PASS login and authenticated /api/v1/auth/me')
        if me['data'].get('role') == 'RESPONDENT':
            avail = json.loads(request(base, '/api/v1/available-surveys', token=token))
            if not isinstance(avail.get('data'), list):
                raise ValueError('Unexpected /api/v1/available-surveys response')
            print('PASS /api/v1/available-surveys')
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        raise RuntimeError('Login smoke check failed') from None
    finally:
        if token:
            request(base, '/api/v1/auth/logout', token=token, method='POST')
            print('PASS logout')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 deploy/smoke_test.py SERVICE_URL')
    check(sys.argv[1].rstrip('/'))