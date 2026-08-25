#!/usr/bin/env python3
"""Serve Piano Session Recorder locally (required for Web MIDI / secure context)."""

from __future__ import annotations

import argparse
import errno
import functools
import http.server
import os
import socketserver
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class DevHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(http.server.SimpleHTTPRequestHandler, "extensions_map", {}),
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".mid": "audio/midi",
        ".midi": "audio/midi",
        ".wasm": "application/wasm",
        ".mp3": "audio/mpeg",
    }

    def end_headers(self) -> None:
        # Browsers aggressively cache ES modules; stale copies silently mask code changes.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def _is_addr_in_use(exc: OSError) -> bool:
    return exc.errno == errno.EADDRINUSE or "Address already in use" in str(exc)


def bind_http_server(host: str, preferred_port: int, handler, *, max_tries: int = 20):
    """Bind the preferred port, falling back to the next free port if it is taken."""
    for offset in range(max_tries):
        port = preferred_port + offset
        try:
            return ReusableTCPServer((host, port), handler), port
        except OSError as exc:
            if _is_addr_in_use(exc) and offset + 1 < max_tries:
                continue
            raise

    raise OSError(f"No free port in range {preferred_port}-{preferred_port + max_tries}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve Piano Session Recorder")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser")
    args = parser.parse_args()

    os.chdir(ROOT)
    handler = functools.partial(DevHandler, directory=str(ROOT))

    try:
        httpd, port = bind_http_server(args.host, args.port, handler)
    except OSError as exc:
        print(f"Could not bind {args.host}:{args.port} (or nearby ports) — {exc}", file=sys.stderr)
        return 1

    if port != args.port:
        print(f"Port {args.port} is in use; serving on {port} instead.", file=sys.stderr)

    url = f"http://{args.host}:{port}/"
    print("Piano Session Recorder")
    print(f"Serving {ROOT}")
    print(f"Open {url}")
    print("Press Ctrl+C to stop.\n")

    if not args.no_open:
        webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
