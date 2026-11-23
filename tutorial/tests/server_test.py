import importlib.util
from io import BytesIO
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location("tutorial_server", Path(__file__).resolve().parents[1] / "serve.py")
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)


class Request:
    def __init__(self, path, method):
        self.input = BytesIO(f"{method} {path} HTTP/1.0\r\n\r\n".encode())
        self.output = BytesIO()

    def makefile(self, mode, *_args):
        return self.input if "r" in mode else self.output

    def sendall(self, data):
        self.output.write(data)


class SilentHandler(serve.TutorialHandler):
    def log_message(self, *_args):
        pass


def handle(path, method="GET"):
    request = Request(path, method)
    SilentHandler(request, ("127.0.0.1", 0), None)
    return request.output.getvalue().split(b"\r\n\r\n", 1)


class StaticServerTests(unittest.TestCase):
    def test_page_and_module_dependencies_are_served(self):
        from collections import deque
        import posixpath
        import re

        header, body = handle("/")
        self.assertIn(b" 200 ", header)
        self.assertIn(b"connect-src 'self'", header)
        self.assertIn(b"./app.mjs", body)
        pending = deque(["/app.mjs", "/style.css"])
        visited = set()
        while pending:
            path = pending.popleft()
            if path in visited:
                continue
            visited.add(path)
            header, body = handle(path)
            self.assertIn(b" 200 ", header, path)
            links = re.findall(rb"""(?:from\s*|import\s*\(\s*|import\s*)['"]([./][^'"]+\.m?js)['"]""", body)
            for link in links:
                value = link.decode()
                pending.append(value if value.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(path), value)))
        self.assertIn("/assets/vendor/three.core.js", visited)

    def test_three_models_are_valid_glb_containers(self):
        for path in ("hero/commuter.glb", "transit-assets/gongdeok-entrance.glb", "transit-assets/ticket-gate.glb"):
            header, body = handle("/assets/" + path)
            self.assertIn(b" 200 ", header)
            self.assertIn(b"model/gltf-binary", header)
            self.assertEqual(struct.unpack("<4sII", body[:12]), (b"glTF", 2, len(body)))

    def test_no_game_api_or_private_files_are_served(self):
        for path in ("/api/play-start", "/administrator", "/.env", "/assets/game.js",
                     "/assets/hero/%2e%2e/%2e%2e/server/app.mjs", "/tests/tutorial.test.mjs"):
            self.assertIn(b" 404 ", handle(path)[0], path)
        self.assertIn(b" 501 ", handle("/api/records", "POST")[0])


if __name__ == "__main__":
    unittest.main()
