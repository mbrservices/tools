/* Template: application for admission to a school Hort, modeled on the
 * Landkreis Sonneberg form. Parent names/addresses come from the guardian
 * roles, pickup-authorized persons are ticked from the guardian list, and
 * "Schulanfänger" is derived from the grade (1 = yes). Registration
 * happens in February for the COMING school year, so the year defaults to
 * the next one. Sheet markup: templates/school-care-registration.mustache */
(() => {
  const nextSchoolYearFull = () => {
    const start = Number(currentSchoolYear().split("/")[0]) + 1;
    return `${start}/${start + 1}`;
  };
  const yesNo = v => ({ yes: v === "ja", no: v === "nein" });
  // parents are authorized to pick up anyway - extraGuardians (the
  // non-parent contacts, shared helper from profiles.js) are offered for
  // pickup and as Vertrauensperson

  // one sheet row per actual parent role (two mothers -> two "Mutter"
  // rows); padded to two rows with the missing role, blank
  const buildParentRows = d => {
    const parents = parentGuardians();
    if (!parents.length) {
      return [
        { role: "Mutter", name: line(d.motherNameFormal), address: line(d.motherAddress || ""), yes: !!(d.custody_mother ?? true), no: !(d.custody_mother ?? true) },
        { role: "Vater", name: line(d.fatherNameFormal), address: line(d.fatherAddress || ""), yes: !!(d.custody_father ?? true), no: !(d.custody_father ?? true) },
      ];
    }
    const rows = parents.map(g => {
      const custody = d[`custody_${g.id}`] ?? true;
      return {
        role: g.role,
        name: line(formalName(g)),
        address: line(guardianAddress(g)),
        yes: !!custody,
        no: !custody,
      };
    });
    while (rows.length < 2) {
      const missingRole = parents.some(g => g.role === "Vater") ? "Mutter" : "Vater";
      rows.push({ role: missingRole, name: line(""), address: line(""), yes: false, no: false });
    }
    return rows;
  };

  registerTemplate({
    id: "school-care-registration",
    label: "Hortanmeldung",
    description: "Antrag auf Aufnahme in einen Schulhort des Landkreises - jährlich neu für das kommende Schuljahr.",
    // live warning: a start after Aug 1st leaves the summer-holiday care
    // before the first school day uncovered
    panelInfo(d) {
      if (!d.careStart) return "";
      // tolerate the short year form ("27/28") seen elsewhere in the app
      const rawYear = Number((d.hortYear || nextSchoolYearFull()).split("/")[0]);
      const startYear = rawYear < 100 ? 2000 + rawYear : rawYear;
      if (!Number.isFinite(startYear)) return "";
      const augustFirst = `${startYear}-08-01`;
      if (d.careStart <= augustFirst) return "";
      return `Achtung: Zwischen 01.08.${startYear} und ${fmtDate(d.careStart)} besteht kein Betreuungsanspruch - auch nicht in den Sommerferien. Für Betreuung ab Schuljahresbeginn den 01.08. wählen.`;
    },
    fields() {
      return [
        // child data (name, birth, address, grade) comes straight from the
        // master data - nothing to override on an official application
        { key: "hortYear", label: "Schuljahr der Anmeldung", type: "text", ph: nextSchoolYearFull() },
        { key: "headingCustody", type: "heading", label: "Sorgeberechtigung der Eltern" },
        ...(parentGuardians().length
          ? parentGuardians().map(g => ({ key: `custody_${g.id}`, label: `${g.role} (${fullName(g)})`, type: "checkbox", default: true }))
          : [
            { key: "custody_mother", label: "Mutter", type: "checkbox", default: true },
            { key: "custody_father", label: "Vater", type: "checkbox", default: true },
          ]),
        { key: "deviatingAddress", label: "Anschrift (falls abweichend)", type: "textarea" },
        { key: "headingCare", type: "heading", label: "Betreuung" },
        // careStart is deliberately shared with the Betreuungszeiten form -
        // both ask for the same care start date
        { key: "careStart", label: "Ab Tag", type: "date" },
        { key: "hours10", label: "Wochenstunden", type: "select", options: ["", "bis 10 Stunden/Woche", "über 10 Stunden/Woche"] },
        { key: "hortPickup", label: "Kind wird aus dem Schulhort abgeholt", type: "select", options: ["", "ja", "nein"] },
        { key: "headingPickup", type: "heading", label: "Weitere abholberechtigte Personen" },
        ...extraGuardians().map(g => ({ key: `pickup_${g.id}`, label: fullName(g), type: "checkbox" })),
        { key: "altContactId", label: "Vertrauensperson", type: "select",
          options: ["", ...extraGuardians().map(g => ({ value: g.id, label: fullName(g) }))] },
        { key: "reduction", label: "Antrag auf Ermäßigung/Befreiung", type: "select", options: ["", "ja", "nein"] },
        { key: "submitBy", label: "Einzureichen bis", type: "date" },
        { key: "date", label: "Datum", type: "date" },
      ];
    },
    view(d) {
      // Schulanfänger derived from the grade: first grade = yes
      const grade = (d.grade || "").trim();
      const starterYes = /^1/.test(grade);
      const pickup = yesNo(d.hortPickup);
      const reduction = yesNo(d.reduction);
      const pickupNames = extraGuardians()
        .filter(g => d[`pickup_${g.id}`])
        .map(g => formalName(g));
      // fallback contact: only what is explicitly picked - an empty
      // selection leaves the sheet lines blank
      const alt = extraGuardians().find(g => g.id === d.altContactId);
      // one deviating-address line per custodial parent (at least two)
      const parentCount = Math.max(2, parentGuardians().length);
      return {
        ...baseView(d),
        hortYearText: d.hortYear || nextSchoolYearFull(),
        schoolName: line(d.school),
        birth: line(d.birth),
        childAddress: line(d.childAddress),
        starterYes,
        starterNo: Boolean(grade) && !starterYes,
        // custody checkboxes default to ticked (= ja); explicitly unticked
        // prints "nein"; a padded, non-existing role stays blank
        parentRows: buildParentRows(d),
        // one line per number (seed joins with ", ", overrides may use newlines)
        allPhones: d.allPhones ? phoneLines(d.allPhones).map(p => line(p)).join("<br>") : line(""),
        deviatingSlots: (lines => Array.from({ length: Math.max(parentCount, lines.length) }, (_, i) => ({ v: lines[i] || "" })))
          ((d.deviatingAddress || "").split("\n").map(s => s.trim()).filter(Boolean)),
        careStartText: line(fmtDate(d.careStart)),
        hoursUnder: d.hours10 === "bis 10 Stunden/Woche",
        hoursOver: d.hours10 === "über 10 Stunden/Woche",
        pickupYes: pickup.yes, pickupNo: pickup.no,
        // the original offers four full-width lines for authorized persons;
        // grow beyond that rather than silently dropping a ticked person
        pickupSlots: Array.from({ length: Math.max(4, pickupNames.length) }, (_, i) => ({ v: pickupNames[i] || "" })),
        altContactName: line(formalName(alt)),
        altContactMobile: line(alt ? (alt.mobile || alt.landline || "") : ""),
        altContactAddress: line(alt ? guardianAddress(alt) : ""),
        reductionYes: reduction.yes, reductionNo: reduction.no,
        submitByText: line(fmtDate(d.submitBy)),
      };
    },
  });
})();
