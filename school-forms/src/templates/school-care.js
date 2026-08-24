/* Template: registration/confirmation of after-school care times, modeled
 * on the official "Erfassung/Bestätigung der Betreuungszeiten im
 * Grundschulhort" form (Schulamtsbereich Südthüringen). Parents fill the
 * upper section; the Hort section stays blank on the sheet, but the weekly
 * sum for the 10-hour fee rule is computed live in the form panel.
 * Sheet markup: templates/school-care.mustache */
(() => {
  const daySums = d => WEEKDAYS.map((_, i) =>
    diffHours(d[`before${i}from`], d[`before${i}to`]) + diffHours(d[`after${i}from`], d[`after${i}to`]));

  registerTemplate({
    id: "school-care",
    label: "Betreuungszeiten im Grundschulhort",
    description: "Jährliche Erfassung der regelmäßigen Hort-Betreuungszeiten nach Stundenplan.",
    // live line below the fields; re-rendered on every input
    panelInfo(d) {
      const weekly = daySums(d).reduce((a, b) => a + b, 0);
      if (!weekly) return "";
      return `Wochensumme: ${fmtHours(weekly)} h`;
    },
    fields() {
      return [
        // careStart is deliberately shared with the Hortanmeldung - both
        // forms ask for the same care start date
        { key: "careStart", label: "Hortbesuch ab", type: "date" },
        { key: "careChange", label: "Änderung der Betreuungszeit ab", type: "date" },
        { key: "headingBefore", label: "Betreuung VOR Unterrichtsbeginn", type: "heading" },
        // the early-morning care always ends at 7:40 (parents' letter), so
        // the to-column pre-fills itself; still editable
        { key: "before", label: "", type: "daygrid", autoTo: "07:40" },
        { key: "headingAfter", label: "Betreuung NACH Unterrichtsende", type: "heading" },
        { key: "after", label: "", type: "daygrid" },
        { key: "pickup", label: "Nach der Betreuung", type: "select", options: [
          "",
          "Mein/unser Kind darf allein nach Hause laufen.",
          "Mein/unser Kind fährt mit dem Schulbus.",
          "Mein/unser Kind wird abgeholt.",
        ] },
      ];
    },
    view(d) {
      const sums = daySums(d);
      const weekly = sums.reduce((a, b) => a + b, 0);
      // compare in whole minutes: float hour sums drift (many exact
      // 10-hour weeks add up to 10.000000000000002 and would tick "über 10 h")
      const weeklyMinutes = Math.round(weekly * 60);
      const days = WEEKDAYS.map((label, i) => ({
        label, // full day names like the original tables
        beforeFrom: d[`before${i}from`] || "",
        beforeTo: d[`before${i}to`] || "",
        afterFrom: d[`after${i}from`] || "",
        afterTo: d[`after${i}to`] || "",
        sumText: sums[i] > 0 ? fmtHours(sums[i]) : "",
      }));
      return {
        hasSums: weeklyMinutes > 0,
        weeklyText: weeklyMinutes > 0 ? fmtHours(weekly) : "",
        under10: weeklyMinutes > 0 && weeklyMinutes <= 600,
        over10: weeklyMinutes > 600,
        ...baseView(d),
        days,
        schoolName: line(d.school),
        schoolNumber: line(d.schoolNumber),
        birth: line(d.birth),
        careStart: fmtDate(d.careStart),
        careChange: fmtDate(d.careChange),
        pickAlone: (d.pickup || "").includes("allein"),
        pickBus: (d.pickup || "").includes("Schulbus"),
        pickUp: (d.pickup || "").includes("abgeholt"),
      };
    },
  });
})();
