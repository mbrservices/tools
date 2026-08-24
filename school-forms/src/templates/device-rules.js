/* Template: acknowledgment slip for the school's rules on smartwatches,
 * phones and MP3 players. The original is a one-page "Belehrung" whose
 * acknowledgment section is filled in and returned - we print just that
 * section on a plain A4 sheet; the instruction text lives in the notes.
 * Sheet markup: templates/device-rules.mustache */
registerTemplate({
  id: "device-rules",
  label: "Nutzungsordnung elektronischer Geräte",
  description: "Kenntnisnahme der Belehrung zu Smartwatches, Handys und MP3-Playern - unterschrieben von Schüler/in und Sorgeberechtigten.",
  fields: [
    { key: "date", label: "Datum", type: "date" },
  ],
  view(d) {
    return {
      ...baseView(d),
      dateText: line(fmtDate(d.date)),
    };
  },
});
