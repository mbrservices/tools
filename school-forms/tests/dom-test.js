/* DOM test: boots the app in happy-dom (no real browser), fills in master
 * data and checks that the sheet preview, child switching, overrides and
 * persistence behave. Complements tests/smoke-test.js, which only covers
 * template rendering. Run via `npm test`. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { Window } = require("happy-dom");
const { manifestFor } = require("../../manifest");

const ROOT = path.join(__dirname, "..", "src");

const window = new Window({ url: "https://localhost/school-forms/" });
const document = window.document;
document.body.innerHTML =
  fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/<body>([\s\S]*)<\/body>/)[1];

const ctx = vm.createContext({
  window,
  document,
  localStorage: window.localStorage,
  Mustache: require(path.join(ROOT, "vendor", "mustache.min.js")),
  console,
  // The app fetches its *.mustache files and manifest.json at runtime;
  // serve them from disk like the dev server does
  fetch: async rel => {
    const file = path.join(ROOT, rel);
    try {
      const text = path.basename(file) === "manifest.json" && !fs.existsSync(file)
        ? JSON.stringify(manifestFor(path.dirname(file)))
        : fs.readFileSync(file, "utf8");
      return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
    } catch (e) {
      return { ok: false, status: 404, text: async () => "", json: async () => null };
    }
  },
});
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
run("profiles.js");
run("app.js");
for (const f of fs.readdirSync(path.join(ROOT, "templates")).filter(f => f.endsWith(".js")).sort()) {
  run(path.join("templates", f));
}

let failed = false;
const fail = msg => { failed = true; console.error("FAIL " + msg); };
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const sheetText = () => $("#sheet").textContent;
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
const visible = el => el.style.display !== "none";
const expectSheet = (text, msg) => { if (!sheetText().includes(text)) fail(`${msg}: "${text}" not in sheet`); };
const waitFor = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("timeout waiting for " + what);
};

(async () => {
  /* --- boots with a filled template dropdown (template fetch is async;
     the default info-only template renders no visible sheet) --- */
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await waitFor(() => $$("#tplSelect option").length, "app boot");
  if ($$("#tplSelect option").length !== 9) fail("expected 9 templates in dropdown");
  if (visible($("#childRow"))) fail("child selector visible without children");
  // default template is the leave-of-absence info entry: no fields, the
  // notes (warning box + rules) render open, not behind a collapsible
  if ($$("#fieldsHost [data-key]").length !== 0) fail("info-only template should have no fields");
  if (visible($(".layout"))) fail("form/preview area shown for an info-only template");
  if (!visible($("#tplNotesHost")) || !$("#tplNotesHost").innerHTML.includes("qs_abuu_v01")) fail("leave-of-absence notes missing");
  if (!$("#tplNotesHost .notes-warning")) fail("warning box missing in notes");
  if ($("#tplNotesHost .notes-warning").closest("details")) fail("warning box must not sit inside a collapsible");

  /* --- the excuse letter is the template used for the form flows below --- */
  const tplSelect = $("#tplSelect");
  tplSelect.value = "absence-excuse";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  if (!visible($(".layout"))) fail("form/preview area hidden for a regular template");
  // this notes file wraps its rules in a native <details>
  if (!$("#tplNotesHost details summary")) fail("absence-excuse rules not collapsible");

  /* --- master data flows into the preview --- */
  $("details.profiles").open = true;
  $$(".profiles-school button.add")[0].click();
  /* picking a directory entry auto-fills the whole school card */
  if (!$("#schoolDirectoryList option")) fail("school directory datalist missing");
  type($('.profiles-school .profile-card input[placeholder="Name der Schule"]'), "Schulzentrum am Wolkenrasen Staatliche Grundschule Sonneberg");
  if (![...$$(".profiles-school .profile-card input")].some(i => i.value === "17286")) {
    fail("school autocomplete did not fill the school number");
  }
  /* a later exact-name match fills only EMPTY fields - manual corrections
     survive and no rebuild steals the focus mid-typing */
  const schoolPhone = [...$$(".profiles-school .profile-card input")].find(i => i.placeholder === "Telefon");
  type(schoolPhone, "03675 999999");
  type($('.profiles-school .profile-card input[placeholder="Name der Schule"]'), "Schulzentrum am Wolkenrasen Staatliche Grundschule Sonneberg");
  if (schoolPhone.value !== "03675 999999") fail("directory hit overwrote a corrected phone number");
  type($('.profiles-school .profile-card input[placeholder="Name der Schule"]'), "Grundschule Testhausen");

  $$("#profilesHost button.add").find(b => b.textContent.includes("Kind")).click();
  type($('.profiles-children .profile-card input[placeholder="Vorname"]'), "Kim");
  type($('.profiles-children .profile-card input[placeholder="Nachname"]'), "Test");
  type($('.profiles-children .profile-card input[placeholder="Klasse"]'), "2a");
  const birthInput = $('.profiles-children .profile-card input[placeholder="Geburtsdatum"]');
  type(birthInput, "1.2.85");
  birthInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  if (birthInput.value !== "01.02.1985") fail("two-digit year in the past must resolve to 19xx: " + birthInput.value);
  type(birthInput, "31.13.2020"); // impossible month must not come back looking validated
  birthInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  if (birthInput.value !== "31.13.2020") fail("impossible date was reformatted: " + birthInput.value);
  type(birthInput, "5.3.20");
  birthInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  if (birthInput.value !== "05.03.2020") fail("birth date not normalized on blur: " + birthInput.value);
  if (visible($("#childRow"))) fail("child selector shown for a single child");
  expectSheet("Kim Test", "child name");
  expectSheet("2a", "child grade");

  /* switch templates and back */
  tplSelect.value = "school-care";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  expectSheet("Test, Kim", "child name after template switch (school-care prints surname first)");
  expectSheet("NUR durch ELTERN", "school-care original sections");
  expectSheet("05.03.2020", "birth date printed in German format");
  expectSheet("Grundschule Testhausen", "school name from master data");
  expectSheet("Schuljahr", "current school year seeded by default");
  if (!$("#tplDescription").textContent.includes("Hort")) fail("template description missing");
  if (!visible($("#tplNotesHost"))) fail("school-care notes not offered");
  if (!$("#tplNotesHost").innerHTML.includes("Frühhort")) fail("school-care notes content missing");

  /* --- day-grid: values cascade to following non-manual days --- */
  type($('[data-key="before0from"]'), "07:00");
  if ($('[data-key="before1from"]').value !== "07:00") fail("time does not cascade to the next day");
  if ($('[data-key="before4from"]').value !== "07:00") fail("time does not cascade to all following days");
  if ($('[data-key="before0to"]').value !== "07:40") fail("early-care end not auto-filled with 07:40");
  if ($('[data-key="before2to"]').value !== "07:40") fail("auto-filled early-care end does not cascade");
  type($('[data-key="before0to"]'), "14:00");
  if ($('[data-key="before3to"]').value !== "14:00") fail("to-column does not cascade");
  type($('[data-key="before2from"]'), "08:00");
  if ($('[data-key="before3from"]').value !== "08:00") fail("manual middle edit does not cascade onward");
  if ($('[data-key="before1from"]').value !== "07:00") fail("cascade overwrote an earlier day");
  if (!$("#panelInfo").textContent.includes("Wochensumme")) fail("panel info line not updated live");
  /* clearing day 2 keeps the manually edited day 3, empties inherited days */
  $('button[data-clear="before"][data-rowkey="before1"]').click();
  if ($('[data-key="before1from"]').value !== "") fail("clear did not empty the day");
  if ($('[data-key="before2from"]').value !== "08:00") fail("clear wiped a manually edited day");
  if ($('[data-key="before3from"]').value !== "") fail("clear did not empty following inherited days");

  /* --- holiday date rows share the same cascade/clear mechanics --- */
  tplSelect.value = "holiday-care";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  const needsCare = $("#f_needsCare"); // rebuilds the panel with one row per holiday weekday
  needsCare.checked = true;
  needsCare.dispatchEvent(new window.Event("input", { bubbles: true }));
  const hcFrom = $$('input[data-grid="hc"]').filter(i => i.dataset.key.endsWith("from"));
  if (hcFrom.length < 2) fail("holiday-care day rows missing");
  else {
    type(hcFrom[0], "09:00");
    if (hcFrom[1].value !== "09:00") fail("holiday time does not cascade");
    if (hcFrom[hcFrom.length - 1].value !== "09:00") fail("holiday time does not cascade to the last day");
    $$('button[data-clear="hc"]')[0].click();
    if (hcFrom[0].value !== "" || hcFrom[1].value !== "") fail("holiday clear button does not empty rows");
  }

  tplSelect.value = "absence-excuse";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));

  $$("#profilesHost button.add").find(b => b.textContent.includes("Elternteil")).click();
  type($('.profiles-guardians .profile-card input[placeholder="Vorname"]'), "Alex");
  type($('.profiles-guardians .profile-card input[placeholder="Nachname"]'), "Test");
  if ($(".profiles-guardians .profile-card select").value !== "Mutter") fail("first contact's role does not default to Mutter");
  expectSheet("Alex Test", "guardian name");
  type($('.profiles-guardians .profile-card input[placeholder="Ort"]'), "Nebelheim");
  expectSheet("Nebelheim", "guardian city used as signature place");

  /* --- household address: whoever enters one first, everyone inherits --- */
  const kimCard = $$(".profiles-children .profile-card")[0];
  if (![...kimCard.querySelectorAll("input")].some(i => i.placeholder === "Nebelheim")) {
    fail("child city does not default to the guardian's (household)");
  }
  /* inherited placeholders update live, without a card rebuild */
  type($('.profiles-guardians .profile-card input[placeholder="Straße und Hausnummer"]'), "Elternweg 3");
  if (![...kimCard.querySelectorAll("input")].some(i => i.placeholder === "Elternweg 3")) {
    fail("guardian street does not propagate live to child placeholders");
  }

  /* --- master data cannot be overridden: no child/guardian text fields --- */
  if ($("#f_child") || $("#f_guardian")) fail("override fields for master data still present");

  /* --- per-child form state; child 2 inherits child 1's address --- */
  // Kim's street input by position - its placeholder is now the inherited one
  type($$(".profiles-children .profile-card")[0].querySelectorAll("input")[4], "Wolkenweg 7");
  $$("#profilesHost button.add").find(b => b.textContent.includes("Kind")).click();
  const secondCard = $$(".profiles-children .profile-card")[1];
  if (![...secondCard.querySelectorAll("input")].some(i => i.placeholder === "Wolkenweg 7")) {
    fail("child 2 street does not default to child 1's");
  }
  type($$('.profiles-children .profile-card input[placeholder="Vorname"]')[1], "Lena");
  type($$('.profiles-children .profile-card input[placeholder="Nachname"]')[1], "Test");
  if (!visible($("#childRow"))) fail("child selector hidden with two children");
  type($("#f_reason"), "Kim ist krank"); // a genuine per-child form field

  const childSelect = $("#childSelect");
  const ids = $$("#childSelect option").map(o => o.value);
  if (ids.length !== 2) fail("expected 2 children in selector");
  childSelect.value = ids[1];
  childSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  expectSheet("Lena Test", "second child after switch");
  if (sheetText().includes("Kim ist krank")) fail("first child's form input leaked into second child");
  childSelect.value = ids[0];
  childSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  expectSheet("Kim ist krank", "first child's form input survived switching");

  /* --- clearing the active child's name for retyping keeps it active --- */
  const kimNames = () => $$('.profiles-children .profile-card')[0]
    .querySelectorAll('input[placeholder="Vorname"], input[placeholder="Nachname"]');
  kimNames().forEach(i => type(i, ""));
  if (JSON.parse(window.localStorage.getItem("school-forms.v1")).child !== ids[0]) {
    fail("clearing the active child's name switched to another child");
  }
  type(kimNames()[0], "Kim");
  type(kimNames()[1], "Test");
  expectSheet("Kim ist krank", "form input still attached after retyping the name");

  /* --- persistence --- */
  const stored = JSON.parse(window.localStorage.getItem("school-forms.v1"));
  if (Object.keys(stored.byChild).length < 2) fail("per-child buckets not persisted");
  const profiles = JSON.parse(window.localStorage.getItem("school-forms.profiles.v1"));
  if (profiles.children.length !== 2) fail("children not persisted in profiles");

  /* --- reset clears only the current child's inputs --- */
  $("#resetBtn").click();
  if (sheetText().includes("Kim ist krank")) fail("reset did not clear the form input");
  expectSheet("Kim Test", "master data survived reset");

  /* --- children can attend different schools (checked on the care sheet,
     the excuse letter deliberately shows no school) --- */
  tplSelect.value = "school-care";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  if ($$(".profiles-children .profile-card select").length !== 0) fail("school picker shown although only one school exists");
  $$(".profiles-school button.add")[0].click();
  type($$('.profiles-school .profile-card input[placeholder="Name der Schule"]')[1], "GS Nebelwald");
  const kimSchoolSel = $$(".profiles-children .profile-card select")[0];
  if (!kimSchoolSel) fail("school picker missing with two schools");
  else {
    kimSchoolSel.value = kimSchoolSel.querySelectorAll("option")[2].value; // second school
    kimSchoolSel.dispatchEvent(new window.Event("input", { bubbles: true }));
    expectSheet("GS Nebelwald", "active child's school on the sheet");
    kimSchoolSel.value = kimSchoolSel.querySelectorAll("option")[1].value;
    kimSchoolSel.dispatchEvent(new window.Event("input", { bubbles: true }));
    expectSheet("Grundschule Testhausen", "school switched back");
  }
  tplSelect.value = "absence-excuse";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));

  /* --- guardian picker appears with two contacts and resets with the form --- */
  $$("#profilesHost button.add").find(b => b.textContent.includes("Elternteil")).click();
  type($$('.profiles-guardians .profile-card input[placeholder="Vorname"]')[1], "Bea");
  type($$('.profiles-guardians .profile-card input[placeholder="Nachname"]')[1], "Test");
  if ($$(".profiles-guardians .profile-card select")[1].value !== "Vater") fail("second contact's role does not default to Vater");
  if (![...$$(".profiles-guardians .profile-card")[1].querySelectorAll("input")].some(i => i.placeholder === "Wolkenweg 7")) {
    fail("guardian does not inherit the household address from a child");
  }
  /* a partial own address ends all inheritance for that card - no mixing */
  type($$(".profiles-guardians .profile-card")[1].querySelectorAll("input")[3], "99999"); // Bea's own PLZ
  if ([...$$(".profiles-guardians .profile-card")[1].querySelectorAll("input")]
      .some(i => i.placeholder === "Wolkenweg 7" || i.placeholder === "Nebelheim")) {
    fail("card with own partial address still shows inherited placeholders");
  }
  const pick = $("#f_guardianPick");
  if (!pick) fail("guardian picker missing with two contacts");
  else {
    const secondId = $$("#f_guardianPick option")[1].value;
    pick.value = secondId;
    pick.dispatchEvent(new window.Event("input", { bubbles: true }));
    expectSheet("Bea Test", "picked guardian in sheet");
    $("#resetBtn").click();
    if ($("#f_guardianPick").value === secondId) fail("guardian picker did not reset to default");
    expectSheet("Alex Test", "guardian reset to first person on the sheet");
  }

  /* --- Hortanmeldung: parent rows, custody, pickup persons, alt contact --- */
  $$("#profilesHost button.add").find(b => b.textContent.includes("Ansprechpartner")).click();
  const omaCard = $$(".profiles-guardians .profile-card")[2];
  type(omaCard.querySelector('input[placeholder="Vorname"]'), "Oma");
  type(omaCard.querySelector('input[placeholder="Nachname"]'), "Test");
  type(omaCard.querySelector('input[placeholder="Mobiltelefon"]'), "0170 3333333");
  tplSelect.value = "school-care-registration";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  const count = needle => sheetText().split(needle).length - 1;
  expectSheet("Test, Alex", "mother row on the Hort registration");
  expectSheet("Test, Bea", "father row on the Hort registration");
  expectSheet("0170 3333333", "all reachable numbers seeded into the phone cell");
  if (count("☒ Ja") !== 2) fail("custody must default to Ja for both parents");
  const custodyBox = $$('#fieldsHost input[type="checkbox"]').find(i => i.dataset.key.startsWith("custody_"));
  custodyBox.checked = false;
  custodyBox.dispatchEvent(new window.Event("input", { bubbles: true }));
  if (count("☒ Ja") !== 1) fail("unticked custody still prints Ja");
  if (count("Test, Oma") !== 0) fail("contact printed although neither picked nor ticked");
  const pickupBox = $$('#fieldsHost input[type="checkbox"]').find(i => i.dataset.key.startsWith("pickup_"));
  pickupBox.checked = true;
  pickupBox.dispatchEvent(new window.Event("input", { bubbles: true }));
  if (count("Test, Oma") !== 1) fail("ticked pickup person missing from the sheet");
  const altSel = $("#f_altContactId");
  altSel.value = $$("#f_altContactId option")[1].value;
  altSel.dispatchEvent(new window.Event("input", { bubbles: true }));
  if (count("Test, Oma") !== 2) fail("picked Vertrauensperson missing from the sheet");
  /* care-gap warning, incl. the short "27/28" year form */
  type($("#f_hortYear"), "27/28");
  type($("#f_careStart"), "2027-09-01");
  if (!$("#panelInfo").textContent.includes("01.08.2027")) fail("care gap warning missing for a late careStart");
  type($("#f_careStart"), "2027-08-01");
  if ($("#panelInfo").textContent.includes("01.08.2027")) fail("care gap warning shown although care starts on Aug 1st");

  /* --- a picked signer whose role leaves the picker filter is dropped --- */
  tplSelect.value = "absence-excuse";
  tplSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  if ($$("#f_guardianPick option").length !== 2) fail("guardian picker must offer only parents");
  const signerPick = $("#f_guardianPick");
  signerPick.value = $$("#f_guardianPick option")[1].value; // Bea
  signerPick.dispatchEvent(new window.Event("input", { bubbles: true }));
  expectSheet("Bea Test", "picked signer on the sheet");
  const beaRole = $$(".profiles-guardians .profile-card select")[1];
  beaRole.value = "weitere Person";
  beaRole.dispatchEvent(new window.Event("input", { bubbles: true }));
  if ($("#f_guardianPick")) fail("picker still shown with a single parent");
  if (sheetText().includes("Bea Test")) fail("stale signer survived the role change");
  expectSheet("Alex Test", "signer fell back to the remaining parent");
  const beaRoleBack = $$(".profiles-guardians .profile-card select")[1];
  beaRoleBack.value = "Vater";
  beaRoleBack.dispatchEvent(new window.Event("input", { bubbles: true }));

  /* --- the footer button wipes ALL stored data (runs last) --- */
  window.confirm = () => false;
  $("#wipeBtn").click();
  if (!window.localStorage.getItem("school-forms.profiles.v1")) fail("wipe ran although the confirm dialog was declined");
  window.confirm = () => true;
  $("#wipeBtn").click();
  if (window.localStorage.getItem("school-forms.v1") || window.localStorage.getItem("school-forms.profiles.v1")) {
    fail("wipe button did not clear the storage");
  }

  console.log(failed ? "DOM TEST FAILED" : "DOM TEST OK");
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
