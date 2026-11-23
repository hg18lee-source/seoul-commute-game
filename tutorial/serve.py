"""Loopback-only static server for the standalone tutorial."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

TUTORIAL = Path(__file__).resolve().parent
ASSETS = TUTORIAL.parent / "online-game" / "dist"
PAGE_FILES = {"index.html", "style.css", "app.mjs", "state.mjs", "dialogue.mjs", "input.mjs"}
ASSET_FILES = {"world.js", "gongdeok-street.js", "transit-scene.js", "storefronts.js", "journey.js"}
ASSET_FOLDERS = {"hero", "vendor", "transit-assets"}


class TutorialHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".glb": "model/gltf-binary",
    }

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        parts = path.lstrip("/").split("/")
        if path == "/":
            file = TUTORIAL / "index.html"
        elif len(parts) == 1 and parts[0] in PAGE_FILES:
            file = TUTORIAL / parts[0]
        elif parts[0] == "assets" and (
            len(parts) == 2 and parts[1] in ASSET_FILES or
            len(parts) >= 3 and parts[1] in ASSET_FOLDERS and
            all(part and not part.startswith(".") for part in parts[2:])
        ):
            file = ASSETS.joinpath(*parts[1:]).resolve()
            if not file.is_relative_to(ASSETS):
                self.send_error(404)
                return None
        else:
            self.send_error(404)
            return None
        if not file.is_file():
            self.send_error(404)
            return None
        self.tutorial_file = file
        return super().send_head()

    def translate_path(self, path):
        return str(self.tutorial_file)

    def end_headers(self):
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; script-src 'self'; style-src 'self'; "
                         "img-src 'self' blob: data:; connect-src 'self' blob: data:; "
                         "worker-src 'self' blob:; base-uri 'none'; form-action 'none'")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8033)
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), TutorialHandler) as server:
        print(f"AI 출근 튜토리얼 · http://127.0.0.1:{server.server_port}/", flush=True)
        server.serve_forever()
