"""Bundle the unchanged static game layout into the Sites ESM worker."""
import base64
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}
FILES = (
    "index.html", "style.css", "game.js", "world.js", "traffic-data.js",
    "vendor/three.module.js", "vendor/three.core.js", "vendor/THREE-LICENSE.txt",
)
assets = {}
for name in FILES:
    source = DIST / name
    content = gzip.compress(source.read_bytes(), mtime=0)
    assets["/" + name] = (TYPES[source.suffix], base64.b64encode(content).decode("ascii"))

server = DIST / "server"
server.mkdir(exist_ok=True)
source = (ROOT / "worker/index.mjs").read_text(encoding="utf-8")
source = source.replace("import { assets } from './assets.mjs';",
                        "const assets = " + json.dumps(assets) + ";", 1)
(server / "index.js").write_text(source, encoding="utf-8")
