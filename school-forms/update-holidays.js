/* Fetches Thuringian school holiday dates from the OpenHolidays API and
 * writes them to src/data/holidays.json (committed - the app never talks
 * to third-party APIs itself). The file is only rewritten when the actual
 * holiday data changed, or when FORCE=1 is set (used by the scheduled
 * workflow's keepalive commit). Run via `npm run update-holidays`. */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "src", "data", "holidays.json");
const SUBDIVISION = process.env.HOLIDAY_SUBDIVISION || "DE-TH";

(async () => {
  const from = new Date();
  from.setDate(1);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 18);
  const iso = d => d.toISOString().slice(0, 10);

  const url = "https://openholidaysapi.org/SchoolHolidays"
    + `?countryIsoCode=DE&subdivisionCode=${SUBDIVISION}&languageIsoCode=DE`
    + `&validFrom=${iso(from)}&validTo=${iso(to)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenHolidays API: HTTP ${res.status}`);
  const raw = await res.json();

  const holidays = raw
    .map(h => ({
      id: h.id,
      name: h.name.find(n => n.language === "DE")?.text ?? h.name[0]?.text ?? "Ferien",
      startDate: h.startDate,
      endDate: h.endDate,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  const changed = JSON.stringify(prev?.holidays) !== JSON.stringify(holidays);
  if (!changed && !process.env.FORCE) {
    console.log("holidays unchanged - file left untouched");
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    source: "openholidaysapi.org",
    subdivision: SUBDIVISION,
    holidays,
  }, null, 2) + "\n");
  console.log(`${changed ? "holidays updated" : "timestamp refreshed"} - ${holidays.length} entries written`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
