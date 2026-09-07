// Lists every Klantnummer mismatch still awaiting a human decision (Teamleader holds a
// different number than the Excel file for that company - never auto-resolved, see
// teamleader-set-klantnummer.js). Joins in the Excel name from the live directory so a person
// reviewing has real context instead of a bare Klantnummer. Deliberately does NOT call out to
// Teamleader per row here (that would be 60+ sequential API calls in one request, well past
// Vercel's timeout) - the company name is fetched lazily, one call, only when a specific row
// is actually being resolved (see teamleader-resolve-mismatch.js).
const { getDirectory, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const directory = await getDirectory();
    const progress = (await getDataset('teamleader_klantnummer_progress')) || {};

    const byKn = {};
    directory.records.forEach(function (r) { byKn[r[0]] = r; });

    const pending = Object.keys(progress).filter(function (kn) {
      return progress[kn].status === 'mismatch' && !progress[kn].reviewed;
    });

    const results = pending.map(function (kn) {
      const rec = byKn[kn];
      return {
        kn: kn,
        excelName: rec ? rec[1] : '(not found in Excel)',
        excelKlantnummer: kn,
        teamleaderCurrentValue: progress[kn].existingValue
      };
    });

    res.status(200).json({ count: results.length, mismatches: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
