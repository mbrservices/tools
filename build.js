/* Build: assemble the deployable site into dist/ - the landing page and
 * each workspace's src/ copied verbatim, plus a generated manifest.json
 * in every directory (the static stand-in for the dev server's on-the-fly
 * directory listing). Run via `npm run build`; needs `npm install` first
 * so the vendored libraries exist. */
const fs = require("fs");
const path = require("path");
const { manifestFor } = require("./manifest");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const WORKSPACES = require("./package.json").workspaces || [];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);
fs.copyFileSync(path.join(ROOT, "index.html"), path.join(DIST, "index.html"));

for (const ws of WORKSPACES) {
  const src = path.join(ROOT, ws, "src");
  const out = path.join(DIST, ws);
  fs.cpSync(src, out, { recursive: true, filter: f => path.basename(f) !== ".DS_Store" });

  // A workspace with dependencies must have vendored them (npm install)
  const wsPkg = require(path.join(ROOT, ws, "package.json"));
  if (Object.keys(wsPkg.dependencies || {}).length && !fs.existsSync(path.join(out, "vendor"))) {
    throw new Error(`${ws}: vendor/ missing in src/ - run npm install first`);
  }
}

// manifest.json for every directory below dist/
const writeManifests = dir => {
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestFor(dir)) + "\n");
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) writeManifests(path.join(dir, e.name));
  }
};
writeManifests(DIST);

console.log(`built ${DIST}`);
