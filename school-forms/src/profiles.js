/* =====================================================================
 * Master data (Stammdaten): school, children, guardians/contacts.
 * Shared across all form templates and stored under its own localStorage
 * key so it survives form resets. Values from here pre-fill the forms;
 * explicit form inputs override them (handled in app.js).
 * ===================================================================== */

/* Person names are stored split (firstName/lastName) so forms can print
 * either order without guessing where the surname starts. */
// "Mia Muster" - natural order for running text
const fullName = o => [o?.firstName, o?.lastName].filter(Boolean).join(" ");
// "Muster, Mia" - for forms that ask for "Name, Vorname"
const formalName = o =>
  o?.firstName && o?.lastName ? `${o.lastName}, ${o.firstName}` : fullName(o);

/* Address and contact helpers shared by app.js and the templates - the
 * household-inheritance business rule lives here ONCE. */
// "Straße 1, 12345 Ort" from street/zip/city parts ("" when none set)
const joinAddress = o => {
  const zipCity = [o?.zip, o?.city].filter(Boolean).join(" ");
  return [o?.street, zipCity].filter(Boolean).join(", ");
};
const hasOwnAddress = o => Boolean(o?.street || o?.zip || o?.city);
// the first address entered anywhere is the household default that
// everyone without an own address inherits (children before contacts);
// as soon as an entry has ANY own address part it inherits nothing -
// forms print its own (partial) address, never a mix
const householdAddress = () =>
  [...Profiles.data.children, ...Profiles.data.guardians].find(hasOwnAddress) || {};
const guardianAddress = g => joinAddress(g) || joinAddress(householdAddress());
const isParent = g => g?.role === "Mutter" || g?.role === "Vater";
const parentGuardians = () => Profiles.data.guardians.filter(g => fullName(g) && isParent(g));
const extraGuardians = () => Profiles.data.guardians.filter(g => fullName(g) && !isParent(g));
// split a phone list entered as one line ("0151 … (Marie), 0160 … (Max)")
// or with newlines into one entry per line
const phoneLines = v => (v || "").split(/\s*\n\s*|,\s+/).filter(Boolean);

const Profiles = (() => {
  const KEY = "school-forms.profiles.v1";
  const empty = () => ({
    schools: [],    // { id, name, street, zip, city, number, phone }
    children: [],   // { id, schoolId, firstName, lastName, grade, birth, street, zip, city }
    guardians: [],  // { id, role, firstName, lastName, street, zip, city, mobile, landline, work, email }
  });
  const uid = () => "p" + Math.random().toString(36).slice(2, 9);

  // normalize common date spellings to "TT.MM.JJJJ"; "" when unparsable
  // (impossible day/month values count as unparsable - they must not come
  // back looking validated)
  function normalizeDate(v) {
    const plausible = (day, month) => day >= 1 && day <= 31 && month >= 1 && month <= 12;
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(v);
    if (m && plausible(Number(m[1]), Number(m[2]))) {
      const century = Number(m[3]) > Number(String(new Date().getFullYear()).slice(2)) ? "19" : "20";
      const year = m[3].length === 2 ? century + m[3] : m[3];
      return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${year}`;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m && plausible(Number(m[3]), Number(m[2]))) return `${m[3]}.${m[2]}.${m[1]}`;
    return "";
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const p = JSON.parse(raw);
      // re-normalize birth dates: normalization runs on leaving the field,
      // so a value typed without a blur may have been stored raw
      (p.children || []).forEach(c => {
        const n = normalizeDate(c.birth || "");
        if (n) c.birth = n;
      });
      return { ...empty(), ...p };
    } catch (e) { return empty(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  const data = load();
  // known schools for the autocomplete (set by app.js from data/schools.json)
  let schoolDirectory = [];

  function renderUI(host, onChange) {
    // placeholders that depend on other cards (inherited addresses) are
    // recomputed on every input - no rebuild, so focus is preserved
    const livePlaceholders = [];
    const notify = () => {
      save();
      livePlaceholders.forEach(h => { h.input.placeholder = h.fn(); });
      onChange();
    };
    const livePlaceholder = (input, fn) => {
      livePlaceholders.push({ input, fn });
      input.placeholder = fn();
      return input;
    };

    function el(tag, className, text) {
      const n = document.createElement(tag);
      if (className) n.className = className;
      if (text) n.textContent = text;
      return n;
    }
    function textInput(ph, value, set, normalize) {
      const i = el("input");
      i.type = "text"; i.placeholder = ph; i.value = value || "";
      i.addEventListener("input", () => { set(i.value.trim()); notify(); });
      if (normalize) i.addEventListener("change", () => { // on leaving the field
        const n = normalize(i.value.trim());
        if (n && n !== i.value) { i.value = n; set(n); notify(); }
      });
      return i;
    }
    function selectInput(ph, options, value, set) {
      const s = el("select");
      const first = el("option", "", ph);
      first.value = "";
      s.append(first);
      options.forEach(o => { // plain string, or { value, label }
        const opt = el("option", "", typeof o === "object" ? o.label : o);
        opt.value = typeof o === "object" ? o.value : o;
        s.append(opt);
      });
      s.value = value || "";
      s.addEventListener("input", () => { set(s.value); notify(); });
      return s;
    }
    function addButton(text, fn) {
      const b = el("button", "add", text);
      b.type = "button";
      b.addEventListener("click", () => { fn(); build(); notify(); });
      return b;
    }
    function removeButton(msg, fn) {
      const b = el("button", "remove", "×");
      b.type = "button";
      b.setAttribute("aria-label", "Entfernen");
      b.addEventListener("click", () => {
        if (!window.confirm(msg())) return; // msg is lazy to show the current name
        fn(); build(); notify();
      });
      return b;
    }

    function build() {
      host.innerHTML = "";
      livePlaceholders.length = 0; // inputs are recreated below

      const section = (cls, label) => {
        const sec = el("div", "profile-section " + cls);
        sec.append(el("label", "field-label", label));
        host.append(sec);
        return sec;
      };
      // zip/city row; fallbackFn provides live greyed defaults (e.g. the
      // inherited address for children) without storing them
      const zipCityRow = (obj, fallbackFn) => {
        const row = el("div", "field-row");
        const zipWrap = el("div"), cityWrap = el("div");
        const zipInput = textInput("PLZ", obj.zip, v => obj.zip = v);
        const cityInput = textInput("Ort", obj.city, v => obj.city = v);
        if (fallbackFn) {
          livePlaceholder(zipInput, () => fallbackFn().zip || "PLZ");
          livePlaceholder(cityInput, () => fallbackFn().city || "Ort");
        }
        zipWrap.append(zipInput);
        cityWrap.append(cityInput);
        row.append(zipWrap, cityWrap);
        return row;
      };
      const nameRow = obj => {
        const row = el("div", "field-row");
        const firstWrap = el("div"), lastWrap = el("div");
        firstWrap.append(textInput("Vorname", obj.firstName, v => obj.firstName = v));
        lastWrap.append(textInput("Nachname", obj.lastName, v => obj.lastName = v));
        row.append(firstWrap, lastWrap);
        return row;
      };

      // row 1: one card per school - children can attend different schools
      const schoolSec = section("profiles-school", "Schulen");
      const schoolGrid = el("div", "profile-grid");
      if (schoolDirectory.length) {
        const dl = el("datalist");
        dl.id = "schoolDirectoryList";
        // no label attribute: Firefox would show it INSTEAD of the value
        schoolDirectory.forEach(e => {
          const o = el("option");
          o.value = e.name;
          dl.append(o);
        });
        schoolSec.append(dl);
      }
      data.schools.forEach(s => {
        const numPhoneRow = el("div", "field-row");
        const numWrap = el("div"), phoneWrap = el("div");
        numWrap.append(textInput("Schulnummer", s.number, v => s.number = v));
        phoneWrap.append(textInput("Telefon", s.phone, v => s.phone = v));
        numPhoneRow.append(numWrap, phoneWrap);
        const nameInput = textInput("Name der Schule", s.name, v => s.name = v);
        if (schoolDirectory.length) {
          nameInput.setAttribute("list", "schoolDirectoryList");
          // picking a directory entry fills the rest of the card - but only
          // fields that are still empty: a directory hit (which also fires
          // when the name is merely retyped) must never overwrite manual
          // corrections, and without anything to fill there is no rebuild
          nameInput.addEventListener("input", () => {
            const hit = schoolDirectory.find(e => e.name === nameInput.value);
            if (!hit) return;
            const fills = ["street", "zip", "city", "number", "phone"]
              .filter(k => !s[k] && hit[k]);
            if (!fills.length) return;
            fills.forEach(k => { s[k] = hit[k]; });
            build();
            notify();
          });
        }
        const card = el("div", "profile-card");
        card.append(
          nameInput,
          textInput("Straße und Hausnummer", s.street, v => s.street = v),
          zipCityRow(s),
          numPhoneRow,
          removeButton(
            () => `Schule „${s.name || "ohne Namen"}“ wirklich löschen?`,
            () => {
              data.schools.splice(data.schools.indexOf(s), 1);
              // detach children that pointed at the deleted school - a
              // dangling id would silently fall back to school 1 on sheets
              data.children.forEach(c => { if (c.schoolId === s.id) c.schoolId = ""; });
            },
          ),
        );
        schoolGrid.append(card);
      });
      schoolGrid.append(addButton("+ Schule hinzufügen", () => data.schools.push({ id: uid(), name: "", street: "", zip: "", city: "", number: "", phone: "" })));
      schoolSec.append(schoolGrid);

      // row 2: one child per column, wrapping after three
      const childSec = section("profiles-children", "Kinder");
      const childGrid = el("div", "profile-grid");
      // any card without an address inherits the household default, shown
      // greyed and recomputed live as other cards are edited (the
      // inheritance rule itself lives in the shared householdAddress())
      const addressFallback = o => () => (hasOwnAddress(o) ? {} : householdAddress());
      data.children.forEach((c, i) => {
        const fb = addressFallback(c);
        const gradeBirthRow = el("div", "field-row");
        const gradeWrap = el("div"), birthWrap = el("div");
        gradeWrap.append(textInput("Klasse", c.grade, v => c.grade = v));
        birthWrap.append(textInput("Geburtsdatum", c.birth, v => c.birth = v, normalizeDate));
        gradeBirthRow.append(gradeWrap, birthWrap);
        const card = el("div", "profile-card");
        card.append(nameRow(c));
        // with several schools each child picks its own (single school: implicit)
        if (data.schools.length > 1) {
          card.append(selectInput("Schule wählen …",
            data.schools.map(s => ({ value: s.id, label: s.name || "(Schule ohne Namen)" })),
            c.schoolId, v => c.schoolId = v));
        }
        card.append(
          gradeBirthRow,
          livePlaceholder(
            textInput("Straße und Hausnummer", c.street, v => c.street = v),
            () => fb().street || "Straße und Hausnummer",
          ),
          zipCityRow(c, fb),
          removeButton(
            () => `Kind „${fullName(c) || "ohne Namen"}“ wirklich löschen?\nAlle zugehörigen Formulareingaben gehen dabei verloren.`,
            () => data.children.splice(data.children.indexOf(c), 1),
          ),
        );
        childGrid.append(card);
      });
      childGrid.append(addButton("+ Kind hinzufügen", () => data.children.push({ id: uid(), schoolId: data.schools[0]?.id || "", firstName: "", lastName: "", grade: "", birth: "", street: "", zip: "", city: "" })));
      childSec.append(childGrid);

      // rows 3+4: parents and further contacts - identical cards, split by
      // role; changing the role moves the card into the other section
      const guardianCard = g => {
        const fb = addressFallback(g);
        const card = el("div", "profile-card");
        card.append(
          selectInput("Rolle wählen …", ["Mutter", "Vater", "weitere Person"], g.role, v => { g.role = v; build(); }),
          nameRow(g),
          livePlaceholder(
            textInput("Straße und Hausnummer", g.street, v => g.street = v),
            () => fb().street || "Straße und Hausnummer",
          ),
          zipCityRow(g, fb),
          textInput("Mobiltelefon", g.mobile, v => g.mobile = v),
          textInput("Festnetz", g.landline, v => g.landline = v),
          textInput("Dienstlich (z. B. Zentrale)", g.work, v => g.work = v),
          textInput("E-Mail", g.email, v => g.email = v),
          removeButton(
            () => `„${fullName(g) || "Eintrag ohne Namen"}“ wirklich löschen?`,
            () => data.guardians.splice(data.guardians.indexOf(g), 1),
          ),
        );
        return card;
      };
      const newGuardian = role => ({
        id: uid(), role,
        firstName: "", lastName: "", street: "", zip: "", city: "", mobile: "", landline: "", work: "", email: "",
      });

      const parentSec = section("profiles-guardians", "Eltern");
      const parentGrid = el("div", "profile-grid");
      data.guardians.filter(isParent).forEach(g => parentGrid.append(guardianCard(g)));
      parentGrid.append(addButton("+ Elternteil hinzufügen", () => data.guardians.push(
        newGuardian(data.guardians.some(g => g.role === "Mutter") ? "Vater" : "Mutter"))));
      parentSec.append(parentGrid);

      const otherSec = section("profiles-guardians", "Weitere Ansprechpartner");
      const otherGrid = el("div", "profile-grid");
      data.guardians.filter(g => !isParent(g)).forEach(g => otherGrid.append(guardianCard(g)));
      otherGrid.append(addButton("+ Ansprechpartner hinzufügen", () => data.guardians.push(newGuardian("weitere Person"))));
      otherSec.append(otherGrid);
    }

    build();
  }

  return { data, renderUI, setSchoolDirectory(list) { schoolDirectory = list || []; } };
})();
