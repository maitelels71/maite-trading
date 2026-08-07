"""One-time Schwab OAuth login (local HTTPS callback on redirect URI).

Usage (from repo root or backend/):

  cd backend
  .\\.venv\\Scripts\\python.exe -m scripts.schwab_login

Opens the Schwab authorize URL, waits on https://127.0.0.1:8182 for the code,
exchanges it for tokens, and writes `.secrets/schwab_token.json`.
"""

from __future__ import annotations

import ssl
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Ensure backend package root is on path when run as module
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.core.config import settings  # noqa: E402
from app.providers.schwab_oauth import (  # noqa: E402
    build_authorize_url,
    exchange_authorization_code,
    resolve_token_path,
)


def _find_openssl() -> str | None:
    """Resolve openssl.exe (often missing from PATH on Windows; ships with Git)."""
    import os
    import shutil

    found = shutil.which("openssl")
    if found:
        return found

    candidates = [
        Path(r"C:\Program Files\Git\usr\bin\openssl.exe"),
        Path(r"C:\Program Files (x86)\Git\usr\bin\openssl.exe"),
    ]
    # Honor GIT_INSTALL_ROOT / where git.exe lives → ../usr/bin/openssl.exe
    git_exe = shutil.which("git")
    if git_exe:
        git_root = Path(git_exe).resolve().parent.parent  # .../Git/cmd → .../Git
        candidates.insert(0, git_root / "usr" / "bin" / "openssl.exe")
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        candidates.append(Path(local_app) / "Programs" / "Git" / "usr" / "bin" / "openssl.exe")

    for path in candidates:
        if path.is_file():
            return str(path)
    return None


def _ensure_localhost_cert(cert_dir: Path) -> tuple[Path, Path]:
    cert_dir.mkdir(parents=True, exist_ok=True)
    cert_file = cert_dir / "schwab_localhost.pem"
    key_file = cert_dir / "schwab_localhost-key.pem"
    if cert_file.exists() and key_file.exists():
        return cert_file, key_file

    openssl = _find_openssl()
    if not openssl:
        raise SystemExit(
            "Need openssl to create a local HTTPS cert for https://127.0.0.1:8182.\n"
            "Git for Windows includes it at: C:\\Program Files\\Git\\usr\\bin\\openssl.exe\n"
            "Add that folder to PATH, or re-install Git with its Unix tools."
        )

    try:
        subprocess.run(
            [
                openssl,
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-keyout",
                str(key_file),
                "-out",
                str(cert_file),
                "-days",
                "825",
                "-nodes",
                "-subj",
                "/CN=127.0.0.1",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return cert_file, key_file
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise SystemExit(f"openssl failed creating localhost cert:\n{detail}") from exc


def main() -> int:
    if not settings.schwab_client_id or not settings.schwab_client_secret:
        print("ERROR: SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET missing in .env")
        return 1

    redirect = settings.schwab_redirect_uri
    parsed = urlparse(redirect)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 8182
    if parsed.scheme != "https":
        print(f"WARNING: redirect URI is not https ({redirect}). Schwab usually requires https.")

    repo_root = Path(__file__).resolve().parents[2]
    cert_file, key_file = _ensure_localhost_cert(repo_root / ".secrets")

    code_holder: dict[str, str | None] = {"code": None, "error": None}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:  # noqa: A003
            return

        def do_GET(self) -> None:  # noqa: N802
            qs = parse_qs(urlparse(self.path).query)
            if qs.get("error"):
                code_holder["error"] = qs["error"][0]
            if qs.get("code"):
                code_holder["code"] = qs["code"][0]
            body = (
                b"<html><body style='font-family:sans-serif;padding:2rem'>"
                b"<h1>Maite Trading</h1>"
                b"<p>Schwab authorization received. You can close this tab.</p>"
                b"</body></html>"
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            done.set()

    httpd = HTTPServer((host, port), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    auth_url = build_authorize_url(settings)
    print("\n=== Schwab OAuth ===")
    print(f"Redirect URI: {redirect}")
    print(f"Listening on https://{host}:{port}")
    print("\n1) Open this URL (or wait — browser may open):\n")
    print(auth_url)
    print("\n2) Log in to Schwab and Approve.")
    print("3) Accept the browser warning for the local self-signed cert if shown.\n")

    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    if not done.wait(timeout=300):
        print("ERROR: Timed out waiting for callback (5 min).")
        httpd.shutdown()
        return 1

    httpd.shutdown()

    if code_holder["error"]:
        print(f"ERROR: OAuth error from Schwab: {code_holder['error']}")
        return 1
    code = code_holder["code"]
    if not code:
        print("ERROR: No authorization code in callback.")
        return 1

    print("Exchanging code for tokens…")
    token = exchange_authorization_code(code, config=settings)
    path = resolve_token_path(settings)
    print(f"OK — token saved to {path}")
    print(f"access_token expires_in={token.get('expires_in')}s")
    print("You can now sync market data (Analyzer → Sync market data).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
