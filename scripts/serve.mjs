// A static file server for dist/ with a configurable Content-Security-Policy, so the tests can
// play the game under the policy a host might send.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain" };

/** Serves `root`; `csp` is sent as the policy of every response, if given. Resolves to the server. */
export function serve(root, csp, extraFiles = {}) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const headers = csp === undefined ? {} : { "content-security-policy": csp };
    if (extraFiles[path] !== undefined) {
      response.writeHead(200, { ...headers, "content-type": "text/html" }).end(extraFiles[path]);
      return;
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { ...headers, "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

export const port = (server) => server.address().port;
