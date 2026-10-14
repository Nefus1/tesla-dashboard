import fs from "node:fs";
import path from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

/**
 * Resolve a URL pathname to a file inside `root`, or null if it would escape
 * the root, touches a dotfile/dot-directory, or is malformed.
 */
export function resolveStaticPath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const relative = decoded === "/" || decoded === "" ? "index.html" : decoded.replace(/^\/+/, "");
  if (relative.split("/").some((part) => part.startsWith("."))) return null;

  const filePath = path.resolve(root, relative);
  const rel = path.relative(root, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return filePath;
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

export function serveStatic(root, req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }

  const filePath = resolveStaticPath(root, pathname);
  if (!filePath) return notFound(res);

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return notFound(res);

    const ext = path.extname(filePath).toLowerCase();
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=0, must-revalidate",
      ETag: etag,
      "Last-Modified": stat.mtime.toUTCString()
    };

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).on("error", () => res.destroy()).pipe(res);
  });
}
