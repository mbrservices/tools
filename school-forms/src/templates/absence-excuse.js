/* Template: excuse note for missed school days (Entschuldigung).
 * Sheet markup: templates/absence-excuse.mustache */
registerTemplate({
  id: "absence-excuse",
  label: "Entschuldigung (Schulversäumnis)",
  description: "Schriftliche Entschuldigung für Fehltage.",
  fields: [
    { key: "guardianPick", label: "Unterzeichnet von", type: "guardianPick", roles: ["Mutter", "Vater"] },
    { key: "from", label: "Gefehlt von", type: "date" },
    { key: "to", label: "Gefehlt bis", type: "date" },
    { key: "reason", label: "Grund", type: "textarea", ph: "z. B. Erkrankung" },
    { key: "date", label: "Datum", type: "date" },
  ],
  view(d) {
    // built from escaped/formatted parts, rendered raw ({{{period}}}) so
    // the empty case shows the shared fillline style
    const period = d.from && d.to && d.from !== d.to
      ? `vom ${line(fmtDate(d.from))} bis einschließlich ${line(fmtDate(d.to))}`
      : `am ${line(fmtDate(d.from || d.to))}`;
    return {
      ...baseView(d),
      period,
      reason: line(d.reason),
      guardian: line(d.guardian),
    };
  },
});
