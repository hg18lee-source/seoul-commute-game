"""Loopback-only review server with an explicit path allowlist."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import sys

ROOT = Path(__file__).resolve().parents[1]
REVIEW = "/street-realism-v4-review/"
REFERENCES = {
    "/references/" + name + ".png"
    for name in ("street-main", "sidewalk", "commercial-street", "station-entrance",
                 "storefront", "residential-alley")
}
PREFIXES = (REVIEW, "/street-photoreal-review/", "/dist/vendor/", "/dist/hero/")


class ReviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/":
            self.send_response(302)
            self.send_header("Location", REVIEW + "index.html")
            self.end_headers()
            return None
        if chr(92) in path or any(part.startswith(".") for part in path.split("/")):
            self.send_error(404)
            return None
        target = ROOT.joinpath(path.lstrip("/")).resolve()
        if (not target.is_relative_to(ROOT) or not target.is_file()
                or not (path in REFERENCES or path.startswith(PREFIXES))):
            self.send_error(404)
            return None
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with ThreadingHTTPServer(("127.0.0.1", port), ReviewHandler) as server:
        print(f"http://127.0.0.1:{port}{REVIEW}index.html", flush=True)
        server.serve_forever()
