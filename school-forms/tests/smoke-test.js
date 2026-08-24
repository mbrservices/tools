/* Smoke test: load the app scripts in a browser-like context and render
 * every registered template with sample data. Run via `npm test`
 * (requires `npm install` first so vendor/mustache.min.js exists). */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const sample = require("./fixtures/sample-data.json");

const ctx = vm.createContext({
  Mustache: require(path.join(ROOT, "vendor", "mustache.min.js")),
  document: { addEventListener() {}, getElementById: () => null },
  console,
});

const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
run("profiles.js");
run("app.js");
for (const f of fs.readdirSync(path.join(ROOT, "templates")).filter(f => f.endsWith(".js")).sort()) {
  run(path.join("templates", f));
}

// The app fetches sheet markup and partials at runtime; read them from disk
const templates = vm.runInContext("TEMPLATES", ctx);
for (const t of templates) {
  t.template = fs.readFileSync(path.join(ROOT, "templates", `${t.id}.mustache`), "utf8");
  for (const [key, file] of Object.entries(t.dataFiles || {})) {
    (t.data ??= {})[key] = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  }
}
const partials = vm.runInContext("PARTIALS", ctx);
const partialsDir = path.join(ROOT, "templates", "partials");
for (const f of fs.readdirSync(partialsDir).filter(f => f.endsWith(".mustache"))) {
  partials[path.basename(f, ".mustache")] = fs.readFileSync(path.join(partialsDir, f), "utf8");
}

const result = vm.runInContext(`
  TEMPLATES.map(t => {
    const sample = ${JSON.stringify(sample)};
    const html = Mustache.render(t.template, t.view ? t.view(sample) : sample, PARTIALS);
    const fieldCount = (typeof t.fields === "function" ? t.fields(sample) : t.fields).length;
    return { id: t.id, length: html.length, html, fieldCount };
  })
`, ctx);

let failed = false;
const fail = msg => { failed = true; console.error("FAIL " + msg); };

if (result.length === 0) fail("no templates registered");
for (const r of result) {
  if (r.html.includes("<Muster>")) fail(`${r.id}: unescaped input in output`);
  // info-only entries (no fields) render no personal data at all; some
  // templates reorder the name ("Nachname, Vorname"), so match loosely -
  // the raw-angle-bracket check above still proves escaping
  if (r.fieldCount > 0 && (!r.html.includes("Mia") || !r.html.includes("&lt;Muster&gt;"))) fail(`${r.id}: escaped child name missing`);
  if (/\{\{/.test(r.html)) fail(`${r.id}: unresolved mustache tags`);
  console.log(`${r.id}: ${r.length} chars rendered`);
}

// school-care: parents' section carries the times, Hort section stays blank
const sc = result.find(r => r.id === "school-care");
if (!sc) fail("school-care template missing");
else {
  for (const expect of ["NUR durch ELTERN auszufüllen", "NUR durch HORT auszufüllen", "07:40", "16:00", "Unterschrift Hortkoordinator",
    // computed Hort values render as grey preview ghosts (hidden in print)
    '<span class="ghost">5:05</span>', '<span class="ghost">14:45</span>', '<span class="ghost">☒</span><span class="print-only">☐</span>']) {
    if (!sc.html.includes(expect)) fail(`school-care: expected "${expect}"`);
  }
}

// the weekly sum is computed into the panel info line:
// Mon 0:40+4:25, Tue 3:40, Wed 6:00 -> 14:45 h
const scTpl = templates.find(t => t.id === "school-care");
const info = scTpl && scTpl.panelInfo(sample);
if (!info || !info.includes("14:45")) {
  fail("school-care: computed weekly sum info wrong: " + info);
}

// two-page forms carry a page break
for (const id of ["learning-materials", "first-aid"]) {
  const r = result.find(x => x.id === id);
  if (!r || !r.html.includes("page-break")) fail(`${id}: page break missing`);
}

// book rows: running number, count defaults to 1 and stays editable
const lm = result.find(x => x.id === "learning-materials");
if (lm && !lm.html.includes("<td>1&nbsp;</td><td>Fibel 1</td><td>1</td>")) fail("learning-materials: first book row wrong");
if (lm && !lm.html.includes("<td>2&nbsp;</td><td>Mathefreunde 1</td><td>2</td>")) fail("learning-materials: entered count not applied");

// absence-excuse: multi-day period and the single-day wording
const ae = result.find(x => x.id === "absence-excuse");
if (ae && !ae.html.includes("vom 01.09.2026 bis einschließlich 03.09.2026")) fail("absence-excuse: period wording wrong");
const aeSingle = vm.runInContext(`(() => {
  const t = TEMPLATES.find(t => t.id === "absence-excuse");
  const sample = ${JSON.stringify(sample)};
  return Mustache.render(t.template, t.view({ ...sample, to: sample.from }), PARTIALS);
})()`, ctx);
if (!aeSingle.includes("am 01.09.2026")) fail("absence-excuse: single-day wording missing");

// holiday-care: render against a fixed synthetic holiday so the assertions
// do not depend on today's date (the real default is the next holidays)
const hc = vm.runInContext(`(() => {
  const t = TEMPLATES.find(t => t.id === "holiday-care");
  const saved = t.data;
  t.data = {
    holidays: { holidays: [{ id: "x", name: "Schulfreier Tag", startDate: "2027-05-07", endDate: "2027-05-07" }] },
    coverage: { coverage: [{ from: "2027-05-01", to: "2027-05-31", school: "GS Deckung" }] },
  };
  const base = { holiday: "x", "hc_2027-05-07_from": "08:00", "hc_2027-05-07_to": "14:00",
                 holidayPickup: "Mein/unser Kind wird abgeholt." };
  const yes = Mustache.render(t.template, t.view({ ...base, needsCare: true }), PARTIALS);
  const no = Mustache.render(t.template, t.view({ ...base, needsCare: false }), PARTIALS);
  t.data = saved;
  return { yes, no };
})()`, ctx);
for (const expect of ["für „Schulfreier Tag 2027“", // non-Ferien phrase
  "Fr 07.05.2027", // UTC weekday arithmetic (a Friday, even around DST)
  "08:00", "GS Deckung", "☒ Mein/unser Kind wird abgeholt."]) {
  if (!hc.yes.includes(expect)) fail(`holiday-care: expected "${expect}"`);
}
// switching to "nein" must not print previously entered times or ticks
if (!hc.no.includes("☒ nein")) fail("holiday-care: 'nein' not ticked");
if (hc.no.includes("08:00") || hc.no.includes("☒ Mein/unser Kind wird abgeholt.")) {
  fail("holiday-care: 'nein' sheet still shows care times or the pickup tick");
}

// school-care: an exactly-10-hour week must stay in the lower fee category
// (float hour sums drift; the comparison runs in whole minutes)
const sc10 = vm.runInContext(`(() => {
  const t = TEMPLATES.find(t => t.id === "school-care");
  const v = t.view({ before0from: "08:00", before0to: "10:00", before1from: "08:00", before1to: "14:40",
                     before2from: "08:00", before2to: "08:35", before3from: "08:00", before3to: "08:45" });
  return { under10: v.under10, over10: v.over10, weeklyText: v.weeklyText };
})()`, ctx);
if (sc10.weeklyText !== "10:00") fail("school-care: 10-hour week sums to " + sc10.weeklyText);
if (!sc10.under10 || sc10.over10) fail("school-care: exact 10-hour week must not tick 'über 10 h'");

// first-aid, fixture path (no master data): fallback blocks + role ticks
const fa = result.find(x => x.id === "first-aid");
if (fa && !fa.html.includes("☒ Mutter")) fail("first-aid: insuredWith fallback tick missing");
if (fa && !fa.html.includes("Muster, Marie")) fail("first-aid: mother fallback block missing");

// first-aid with two mothers: the second one fills the other block, the
// selects offer only actual persons, disambiguated by name
const fa2 = vm.runInContext(`(() => {
  const t = TEMPLATES.find(t => t.id === "first-aid");
  Profiles.data.guardians.push(
    { id: "ma", role: "Mutter", firstName: "Marie", lastName: "Muster", mobile: "0151 1111111" },
    { id: "mb", role: "Mutter", firstName: "Anna", lastName: "Muster", mobile: "0151 2222222" },
  );
  const opts = t.fields({}).find(f => f.key === "workContact").options;
  const html = Mustache.render(t.template, t.view({ workContact: "mb" }), PARTIALS);
  Profiles.data.guardians.length = 0;
  return { opts, html };
})()`, ctx);
if (JSON.stringify(fa2.opts) !== JSON.stringify(["",
  { value: "ma", label: "Mutter (Marie Muster)" },
  { value: "mb", label: "Mutter (Anna Muster)" }])) {
  fail("first-aid: parent options wrong: " + JSON.stringify(fa2.opts));
}
// the block headers show the bare role (names sit in the block rows);
// both tick lists carry the name tag because no name stands next to them
if (!fa2.html.includes('<span style="display:block;">☐ Mutter (Marie Muster)</span><span style="display:block;">☐ Mutter (Anna Muster)</span>')) {
  fail("first-aid: insured ticks must sit on own lines and carry the name tag");
}
if (!fa2.html.includes("<u>Mutter</u>") || fa2.html.includes("<u>Mutter (")) fail("first-aid: block headers must show the bare role");
if (!fa2.html.includes("☒ Mutter (Anna Muster)")) fail("first-aid: picked second mother not ticked on page 2");
if (fa2.html.includes("☒ Mutter (Marie Muster)")) fail("first-aid: wrong mother ticked on page 2");
if (!fa2.html.includes("Muster, Anna")) fail("first-aid: second mother block missing");
if (fa2.html.includes("<u>Vater</u>")) fail("first-aid: empty Vater block shown despite a second mother");

// registration: slot lists grow with the master data instead of dropping
const slots = vm.runInContext(`(() => {
  const t = TEMPLATES.find(t => t.id === "school-care-registration");
  Profiles.data.guardians.push(
    { id: "m1", role: "Mutter", firstName: "Marie", lastName: "Muster" },
    ...Array.from({ length: 5 }, (_, i) => ({ id: "e" + i, role: "weitere Person", firstName: "P" + i, lastName: "Muster" })),
  );
  const d = Object.fromEntries(Array.from({ length: 5 }, (_, i) => ["pickup_e" + i, true]));
  const v = t.view(d);
  Profiles.data.guardians.length = 0;
  return { pickup: v.pickupSlots.map(s => s.v), deviating: v.deviatingSlots.length };
})()`, ctx);
if (slots.pickup.length !== 5 || slots.pickup[4] !== "Muster, P4") fail("registration: fifth pickup person dropped");
if (slots.deviating !== 2) fail("registration: a single parent must still get two deviating-address lines");

console.log(failed ? "SMOKE TEST FAILED" : "SMOKE TEST OK");
process.exit(failed ? 1 : 0);
