/* Copies the browser libraries the app loads from src/vendor/ out of
 * node_modules (npm run vendor, also run on postinstall). They are fetched
 * at install time and stay out of Git. */
const fs = require("fs");
const path = require("path");

const FILES = [
  "mustache/mustache.min.js",
  "jspdf/dist/jspdf.umd.min.js",
  "html2canvas/dist/html2canvas.min.js",
];

const dest = path.join(__dirname, "src", "vendor");
fs.mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  fs.copyFileSync(require.resolve(file), path.join(dest, path.basename(file)));
}
