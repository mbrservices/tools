/* Template: emergency contact sheet, modeled on the school's two-page
 * "Erste-Hilfe-Maßnahmen (Erreichbarkeit)" form. The two contact blocks
 * hold the (up to two) parents from the master data: a missing role is
 * covered by a second parent of the other role (two mothers -> two Mutter
 * blocks, disambiguated by name), else its block stays blank. The
 * insured-with/contact selects offer exactly these parents. The fallback
 * contact is picked from everyone not already in a block (same selection
 * key as the Hort registration). Sheet markup: templates/first-aid.mustache */
(() => {
  // the (up to) two parents printed in the contact blocks
  const blockParents = () => parentGuardians().slice(0, 2);
  const contactCandidates = () => {
    const seeded = new Set(blockParents().map(g => g.id));
    return Profiles.data.guardians.filter(g => fullName(g) && !seeded.has(g.id));
  };
  // both blocks share a role -> disambiguate by name ("Mutter (Marie Muster)")
  const needsNameTag = parents => parents.length === 2 && parents[0].role === parents[1].role;

  registerTemplate({
    id: "first-aid",
    label: "Erste-Hilfe-Maßnahmen (Erreichbarkeit)",
    description: "Notfall-Kontaktbogen: Erreichbarkeit der Eltern, Krankenkasse und Hausarzt.",
    fields() {
      const parents = blockParents();
      const tag = needsNameTag(parents);
      // only actual persons are selectable - no ticking a role nobody holds
      const parentOpts = parents.map(g => ({ value: g.id, label: tag ? `${g.role} (${fullName(g)})` : g.role }));
      return [
        { key: "insurer", label: "Krankenkasse", type: "text" },
        { key: "insuredWith", label: "Mitversichert bei", type: "select", options: ["", ...parentOpts] },
        { key: "workContact", label: "An wen soll sich die Schule wenden?", type: "select", options: ["", ...parentOpts] },
        { key: "altContactId", label: "Vertrauensperson", type: "select",
          options: ["", ...contactCandidates().map(g => ({ value: g.id, label: fullName(g) }))] },
        { key: "doctor", label: "Hausarzt (Anschrift und Telefonnummer)", type: "textarea" },
        { key: "returnBy", label: "Rückgabetermin", type: "date" },
        { key: "date", label: "Datum", type: "date" },
      ];
    },
    view(d) {
      const parents = blockParents();
      const tag = needsNameTag(parents);
      // g = null renders a blank block for the given role; seedPrefix feeds
      // the no-master-data fallback from flat keys (used by the test fixture)
      // NB: the block headers show the bare role (the name already sits in
      // the block rows); the two tick lists have no name next to them, so
      // they carry the name tag like the panel selects
      const block = (g, role, seedPrefix) => {
        const seed = suffix => (seedPrefix ? d[seedPrefix + suffix] : "");
        return {
          role,
          tickTag: tag && g ? `${role} (${fullName(g)})` : role,
          // the selects store the guardian id; the fallback matches by role
          insured: d.insuredWith === (g ? g.id : role),
          workPicked: d.workContact === (g ? g.id : role),
          // the parent rows ask for "Name, Vorname"
          name: line(g ? formalName(g) : seed("NameFormal")),
          address: line(g ? guardianAddress(g) : seed("Address")),
          mobile: line(g ? g.mobile : seed("Mobile")),
          landline: line(g ? g.landline : seed("Landline")),
          work: line(g ? g.work : seed("Work")),
          email: line(g ? g.email : seed("Email")),
        };
      };
      const parentBlocks = parents.length
        ? parents.map(g => block(g, g.role))
        : [block(null, "Vater", "father"), block(null, "Mutter", "mother")];
      while (parentBlocks.length < 2) {
        parentBlocks.push(block(null, parents.some(g => g.role === "Vater") ? "Mutter" : "Vater"));
      }
      // fallback contact: only what is explicitly picked
      const alt = contactCandidates().find(g => g.id === d.altContactId);
      return {
        ...baseView(d),
        birth: line(d.birth),
        insurer: line(d.insurer),
        parentBlocks,
        alt: {
          // no "Name, Vorname" label here, but keep the order consistent
          name: line(formalName(alt)),
          address: line(alt ? guardianAddress(alt) : ""),
          mobile: line(alt?.mobile || ""),
          landline: line(alt?.landline || ""),
          work: line(alt?.work || ""),
        },
        // no underline – the box itself is the fill-in area; keep line breaks
        doctor: d.doctor ? d.doctor.split("\n").map(s => (s ? line(s) : "")).join("<br>") : "",
        returnByText: fmtDate(d.returnBy),
        sigLabel: "Unterschrift der Sorgeberechtigten",
      };
    },
  });
})();
