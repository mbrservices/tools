/* Directory listing used as a static "API": an array of the plain file
 * names in a directory. The dev server serves it on the fly for any
 * requested <dir>/manifest.json, the build writes it as a real file. */
const fs = require("fs");

function manifestFor(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && !e.name.startsWith(".") && e.name !== "manifest.json")
    .map(e => e.name)
    .sort();
}

module.exports = { manifestFor };
