// Loaded only by the local development entry point.
import { readFile } from 'node:fs/promises';

const pages = new Set(['index.html', 'app.mjs', 'input.mjs', 'state.mjs', 'guidance.mjs', 'visual-guide.mjs', 'dialogue.mjs', 'style.css']);
const modules = new Set(['world.js', 'gongdeok-street.js', 'transit-scene.js', 'storefronts.js', 'journey.js']);
const assetFolders = new Set(['hero', 'vendor', 'transit-assets']);
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  js: 'text/javascript; charset=utf-8', glb: 'model/gltf-binary', txt: 'text/plain; charset=utf-8' };

export function localTutorialFile(path) {
  if (path === '/tutorial/' || path === '/tutorial') return new URL('./index.html', import.meta.url);
  if (path.startsWith('/tutorial/')) {
    const name = path.slice('/tutorial/'.length);
    return pages.has(name) ? new URL(name, import.meta.url) : null;
  }
  if (!path.startsWith('/assets/')) return undefined;
  const relative = path.slice('/assets/'.length);
  const parts = relative.split('/');
  if (modules.has(relative) || (assetFolders.has(parts[0]) && parts.length > 1 &&
    parts.every(part => /^[\w-][\w.-]*$/.test(part)) && Object.hasOwn(mime, relative.split('.').at(-1)))) {
    return new URL('../online-game/dist/' + relative, import.meta.url);
  }
  return null;
}

export async function serveTutorial(req, res, path) {
  const file = localTutorialFile(path);
  if (file === undefined) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return true;
  }
  if (path === '/tutorial') {
    res.writeHead(308, { Location: '/tutorial/' }).end();
    return true;
  }
  if (!file) {
    res.writeHead(404).end();
    return true;
  }
  const content = await readFile(file);
  res.writeHead(200, {
    'Content-Type': mime[file.pathname.split('.').at(-1)],
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'",
  }).end(req.method === 'HEAD' ? undefined : content);
  return true;
}

export const enableTutorialMenu = html =>
  html.replace('</head>', '<meta name="local-tutorial" content="enabled">\n</head>');
