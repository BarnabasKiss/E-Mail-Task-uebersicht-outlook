// Node "Kontakte bauen" (Code, Run Once for All Items): Aktion listContacts.
// Macht aus den Outlook-Kontakten Name, Firma, Funktion und Adressen (Kontakte ohne E-Mail-Adresse fallen weg, höchstens 5000).
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id);
const items = rows.slice(0, 5000).map((r) => ({
  name: r.displayName || '',
  company: r.companyName || '',
  title: r.jobTitle || '',
  addresses: (r.emailAddresses || []).map((a) => ({ name: a.name || '', address: a.address || '' })).filter((a) => a.address)
})).filter((c) => c.addresses.length);
return [{ json: { items, total: rows.length } }];
