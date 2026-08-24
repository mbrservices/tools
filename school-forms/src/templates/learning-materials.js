/* Template: textbook loan form, modeled on the school's two-page
 * "Lernmittel-Leihschein" (page 2 lists the care obligations and carries
 * the signature). Sheet markup: templates/learning-materials.mustache */
registerTemplate({
  id: "learning-materials",
  label: "Lernmittel-Leihschein",
  description: "Leihschein für Schulbücher und lehrwerksbegleitende Materialien.",
  fields: [
    { key: "booksHeading", type: "heading", label: "Lernmittel (Titel und Anzahl)" },
    ...Array.from({ length: 9 }, (_, i) => ({ key: `book${i}_`, label: `Lernmittel ${i + 1}`, type: "itemrow" })),
    { key: "date", label: "Datum", type: "date" },
  ],
  view(d) {
    // rows with a title get a running number; count defaults to 1
    const entries = [];
    for (let i = 0; i < 9; i++) {
      const title = d[`book${i}_title`];
      if (title) entries.push({ no: entries.length + 1, title, count: d[`book${i}_count`] || "1" });
    }
    const rows = Array.from({ length: 9 }, (_, i) => entries[i] || { no: "", title: "", count: "" });
    return {
      ...baseView(d),
      birth: line(d.birth),
      childAddress: line(d.childAddress),
      rows,
      sigLabel: "Unterschrift eines Erziehungsberechtigten",
    };
  },
});
