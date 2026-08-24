/* Template: acknowledgment slip for the school's excuse rules. The
 * original is a parents' letter whose lower section is cut off, filled in
 * and returned - we print just that slip on a plain A4 sheet.
 * Sheet markup: templates/excuse-rules.mustache */
registerTemplate({
  id: "excuse-rules",
  label: "Kenntnisnahme Entschuldigungsregeln",
  description: "Rückmeldeabschnitt des Elternbriefs zu den Entschuldigungsregeln - wird jährlich unterschrieben zurückgegeben.",
  fields: [
    { key: "date", label: "Datum", type: "date" },
  ],
  view(d) {
    return {
      ...baseView(d),
      dateText: fmtDate(d.date),
    };
  },
});
