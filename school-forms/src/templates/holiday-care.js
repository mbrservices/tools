/* Template: holiday care demand survey (Ferienbetreuung).
 * The dynamic parts come from data files: holiday periods from
 * data/holidays.json (auto-updated weekly via the OpenHolidays API) and
 * the school covering each period from data/coverage.json (maintained by
 * hand). Sheet markup: templates/holiday-care.mustache */
(() => {
  const DOW = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  // Call fn for every weekday (Mon-Fri) between two ISO dates, inclusive.
  // All arithmetic in UTC: new Date(iso) parses UTC midnight, so local
  // getters would shift days around DST changes and west of UTC.
  function eachWeekday(startIso, endIso, fn) {
    const end = new Date(endIso);
    for (const d = new Date(startIso); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) fn(d.toISOString().slice(0, 10), d.getUTCDay());
    }
  }

  registerTemplate({
    id: "holiday-care",
    label: "Betreuungsbedarf in den Ferien",
    description: "Verbindliche Anmeldung des Betreuungsbedarfs für die Ferien.",
    dataFiles: {
      holidays: "data/holidays.json",
      coverage: "data/coverage.json",
    },
    selectedHoliday(d) {
      const list = this.data?.holidays?.holidays ?? [];
      // default to the next holidays that have not ended yet - the list is
      // chronological and may start with entries that are already over
      const today = new Date().toISOString().slice(0, 10);
      return list.find(h => h.id === d.holiday) ?? list.find(h => h.endDate >= today) ?? list[0];
    },
    fields(d) {
      const holidays = this.data?.holidays?.holidays ?? [];
      const sel = this.selectedHoliday(d);
      const fields = [
        { key: "holiday", label: "Ferien", type: "select", rebuild: true, default: sel?.id,
          options: holidays.map(h => ({ value: h.id, label: `${h.name} (${fmtDate(h.startDate)} - ${fmtDate(h.endDate)})` })) },
        // checked = ja, unchecked = nein (the form demands an explicit choice)
        { key: "needsCare", label: "Betreuung im Hort benötigt", type: "checkbox", rebuild: true },
      ];
      if (sel && d.needsCare === true) {
        fields.push({ key: "headingTimes", label: "Betreuungszeiten (leer = keine Betreuung)", type: "heading" });
        eachWeekday(sel.startDate, sel.endDate, (iso, dow) => {
          fields.push({ key: `hc_${iso}_`, label: `${DOW[dow]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`, type: "timespan", series: "hc" });
        });
        fields.push(
          // own keys (holidayPickup/holidayPhone/holidayReturnBy): other
          // templates ask similar questions under pickup/phone/returnBy -
          // sharing those state keys would leak answers between the sheets
          { key: "holidayPickup", label: "Nach der Betreuung", type: "select",
            options: ["", "Mein/unser Kind wird abgeholt.", "Mein/unser Kind darf allein nach Hause."] },
          // defaults to ALL parents' mobile numbers, an entry here overrides
          { key: "holidayPhone", label: "Tel. Erreichbarkeit während der Ferien", type: "text" },
        );
      }
      fields.push(
        { key: "holidayReturnBy", label: "Rückgabe bis", type: "date" },
        { key: "date", label: "Datum", type: "date" },
      );
      return fields;
    },
    view(d) {
      const sel = this.selectedHoliday(d);
      const coverage = this.data?.coverage?.coverage ?? [];
      const covFor = iso => coverage.find(c => iso >= c.from && iso <= c.to)?.school ?? "";
      const needsYes = d.needsCare === true;
      const rows = [];
      if (sel) {
        eachWeekday(sel.startDate, sel.endDate, (iso, dow) => {
          rows.push({
            dateText: `${DOW[dow]} ${fmtDate(iso)}`,
            // times entered before switching to "nein" must not print - the
            // sheet would tick "nein" and still show care times
            from: needsYes ? d[`hc_${iso}_from`] || "" : "",
            to: needsYes ? d[`hc_${iso}_to`] || "" : "",
            coverage: covFor(iso),
            weekStart: dow === 1 && rows.length > 0,
          });
        });
      }
      return {
        ...baseView(d),
        schoolNumber: line(d.schoolNumber),
        // "in den Herbstferien 2026", but "für „Schulfreier Tag 2027“" –
        // non-Ferien entries from the holiday API break the dative phrase
        holidayPhrase: (title => /ferien/i.test(sel?.name || "") ? `in den ${title}` : `für „${title}“`)
          (sel ? `${sel.name} ${sel.startDate.slice(0, 4)}` : "Ferien"),
        returnByText: line(fmtDate(d.holidayReturnBy)),
        needsYes,
        needsNo: !needsYes,
        pickedUp: needsYes && (d.holidayPickup || "").includes("abgeholt"),
        aloneHome: needsYes && (d.holidayPickup || "").includes("allein"),
        phone: (() => { // one number per line
          const nums = d.holidayPhone
            ? phoneLines(d.holidayPhone)
            : parentGuardians().filter(g => g.mobile).map(g => `${g.mobile} (${fullName(g)})`);
          return nums.length ? nums.map(n => line(n)).join("<br>") : line("");
        })(),
        rows,
        dateText: fmtDate(d.date),
      };
    },
  });
})();
