#!/usr/bin/env python3
"""
Static server for SimpleLife plus a small results collector.

Serving the repository over http:// (rather than opening the file directly)
matches how the app is really deployed, and lets the regression suite be
fetched and injected from the page itself.

    python testing/automation/serve-and-collect.py [port]

    GET  /                          -> the repository, so /SimpleLife.html works
    POST /__results/<name>.json     -> writes the body to testing/results/<name>.json

Run it from the repository root.
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESULTS_DIR = os.path.join(ROOT, "testing", "results")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if not self.path.startswith("/__results/"):
            self.send_error(404)
            return
        name = os.path.basename(self.path)
        if not name.endswith(".json"):
            self.send_error(400, "results must be .json")
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        try:
            parsed = json.loads(body.decode("utf-8"))
        except ValueError as exc:
            self.send_error(400, "not valid JSON: %s" % exc)
            return

        os.makedirs(RESULTS_DIR, exist_ok=True)
        target = os.path.join(RESULTS_DIR, name)
        with open(target, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(parsed, fh, indent=2, ensure_ascii=False)
            fh.write("\n")

        payload = json.dumps({"written": os.path.relpath(target, ROOT)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def end_headers(self):
        # the suite is re-fetched between runs, so never serve a stale copy
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("serving %s on http://127.0.0.1:%d" % (ROOT, port))
    print("open http://127.0.0.1:%d/SimpleLife.html" % port)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
