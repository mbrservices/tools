/* Zero-dependency static dev server for local development (`npm run dev`).
 * The apps load their *.mustache templates via fetch(), which browsers
 * block on file:// - so serve the repo over HTTP instead. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { manifestFor } = require("./manifest");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const WORKSPACES = require("./package.json").workspaces || [];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mustache": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) { // malformed percent-encoding must not crash the server
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("400 Bad Request");
    return;
  }
  // dot segments never resolve to servable files (.git, dotfiles, and any
  // ".." that survived decoding as a literal segment)
  if (urlPath.split("/").some(seg => seg.startsWith("."))) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }
  // Workspaces keep their deployable files in src/; serve them at the same
  // URL they get in production (the build collapses src/ into dist/<tool>/)
  const [, first, rest = "/"] = urlPath.match(/^\/([^/]+)(\/.*)?$/) || [];
  const mapped = WORKSPACES.includes(first) ? `/${first}/src${rest}` : urlPath;
  let file = path.normalize(path.join(ROOT, mapped));
  // the separator check keeps sibling directories with a "tools" name
  // prefix out of reach
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    // Redirect directory URLs to a trailing slash (like production static
    // hosts do) - otherwise the browser resolves relative asset URLs
    // against the parent directory
    if (!urlPath.endsWith("/")) {
      res.writeHead(301, { Location: urlPath + "/" });
      res.end();
      return;
    }
    file = path.join(file, "index.html");
  }
  // <dir>/manifest.json is generated on the fly - the build writes the same
  // listing as a static file, so no rebuild is needed while developing
  if (path.basename(file) === "manifest.json" && !fs.existsSync(file) && fs.existsSync(path.dirname(file))) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(manifestFor(path.dirname(file))));
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
// bind loopback only - a dev server has no business being reachable from
// the local network (it serves the whole working tree)
}).listen(PORT, "127.0.0.1", () => console.log(`dev server: http://localhost:${PORT}/school-forms/`));
