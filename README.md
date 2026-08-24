# tools.mbr.services

Small static web tools, published via GitHub Pages at
[tools.mbr.services](https://tools.mbr.services). Everything runs entirely in
the browser: all form input stays in localStorage and is never sent anywhere.
(The site itself is served by GitHub Pages, so requesting it exposes the usual
request metadata - IP address etc. - to GitHub; hence the privacy link in the
footer.)

## Tools

| Path | Tool |
| --- | --- |
| [`school-forms/`](school-forms/) | Fill in German school forms, preview them as an A4 sheet and save/print them as PDF |

## Repository layout

```
index.html                  Landing page (tool overview)
server.js                   Zero-dependency static dev server (npm run dev)
build.js                    Assembles dist/ incl. generated manifest.json files
manifest.js                 Shared directory-listing logic for server.js and build.js
school-forms/               npm workspace, one per tool
  package.json              Tool-specific dependencies, tests and vendor script
  update-holidays.js        Fetches Thuringian school holidays into src/data/
  src/                      Everything in here is deployed as-is to /school-forms/
    index.html              App shell
    styles.css              All styles incl. print CSS
    app.js                  App logic, template registry, shared view helpers
    profiles.js             Master data (school, children, contacts) shared across forms
    templates/*.mustache    Sheet markup per form template, fetched at runtime
    templates/*.js          Field definitions + view() (computed values) per template
    templates/partials/     Shared mustache partials (school header, signature row)
    data/                   holidays.json (auto-updated weekly), coverage.json and
                            schools.json (school directory for the autocomplete; manual)
    vendor/                 mustache.min.js - copied at install time, not committed
  examples/                 Private scans of the original forms - gitignored, never deployed
  tests/smoke-test.js       Renders every template with the fixture data
  tests/dom-test.js         Boots the app in happy-dom and exercises master data,
                            child switching and persistence
  tests/fixtures/           Sample form data used by the tests
```

The dev server maps `/<workspace>/` to `<workspace>/src/`, so local URLs match
the deployed ones.

Every served directory answers `<dir>/manifest.json` with an array of its file
names - a static stand-in for a listing API. The dev server generates it on the
fly (no rebuild while developing), the build writes it as a real file. The app
uses it e.g. to discover the mustache partials in `templates/partials/`.

Third-party code is not committed. [mustache.js](https://github.com/janl/mustache.js)
is pinned in the workspace's `package.json`, integrity-checked via the root
`package-lock.json` and copied into `school-forms/src/vendor/` by the `vendor`
npm script (runs automatically on `npm install`).

## Local development

Node is managed with [mise](https://mise.jdx.dev) (see `mise.toml`):

```sh
mise install
npm install        # installs all workspaces, copies mustache into school-forms/vendor/
npm test           # template render test + DOM boot test (both also run in CI)
npm run dev        # serves the site at http://localhost:8080/school-forms/
```

The apps fetch their `*.mustache` templates at runtime, so the site must be
served over HTTP - opening `index.html` via `file://` is not supported.

## Build

```sh
npm run build
```

`build.js` assembles the deployable site into `dist/`: the landing page, each
workspace's `src/` copied verbatim (incl. the vendored library) and a
`manifest.json` per directory.

## Deployment (GitHub Pages)

Pushes to `main` are deployed automatically by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
(build with mise/npm, upload `dist/`, deploy).

## Adding a form template

Create a pair in `school-forms/src/templates/`: `<id>.mustache` with the sheet
markup, and `<id>.js` calling `registerTemplate({...})` with `id`, `label`,
`fields` and `view(d)`. Nothing else - the app discovers both files via the
directory manifest and loads them at runtime (dropdown sorted by label).
`fields` may be a function of the current data for dynamic field lists, and a
template can declare `dataFiles` (JSON fetched into `this.data`, see
`holiday-care.js`). An optional `<id>.notes.html` renders as accompanying
notes in the template panel - the file decides its own structure and wraps
long sections in native `<details>` where useful. Computations (formatted dates, sums, derived values) belong
in `view(d)` - the Mustache template itself stays logic-less.

## Holiday data

`school-forms/src/data/holidays.json` (Thuringian school holiday dates, from
the [OpenHolidays API](https://www.openholidaysapi.org/)) is refreshed weekly
by [`.github/workflows/update-holidays.yml`](.github/workflows/update-holidays.yml),
which commits only when dates actually changed - plus a keepalive commit after
~50 quiet days so GitHub's 60-day inactivity rule never disables the schedule.
The fetch happens in the workflow runner; the published site stays fully static
and users never contact third-party APIs. `data/coverage.json` (which school
covers which care period) and `data/schools.json` (the school directory feeding
the master-data autocomplete) have no public source and are maintained by hand.
