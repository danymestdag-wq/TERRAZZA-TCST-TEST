// Real "Sync with Teamleader" endpoint. For every customer not yet matched (matched=0 in the
// live directory), searches Teamleader by name and links it when there's a confident single
// exact match - confirmed working filter shape: companies.list with filter.term (NOT filter.name,
// which is silently ignored and returns an unrelated default list - verified empirically before
// building this, see api/teamleader-test.js). Anything ambiguous or not found is left alone,
// same conservative "only auto-link on strong evidence" rule used throughout this project's
// earlier manual contact-matching work.
const { getAccessToken, tlPost, getDirectory, saveDirectory, getDataset, saveDataset } = require('./_teamleader');

const KLANTTYPE_FIELD_ID = '094c7d72-6c35-020b-b453-766c4374b923';
const BATCH_LIMIT = 20;

function normalizeName(s) {
  return String(s || '').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const directory = await getDirectory();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};

    const records = directory.records;
    const onlyKn = req.query.kn ? parseInt(req.query.kn) : null;
    const unmatched = records.filter(function (r) { return r[10] === 0 && (onlyKn === null || r[0] === onlyKn); });
    // Highest Klantnummer first - new customers get the newest numbers, and checking them is
    // what people actually want from this button, not working through years of old backlog
    // in whatever order the Excel file happened to list them.
    unmatched.sort(function (a, b) { return b[0] - a[0]; });
    const toCheck = onlyKn !== null ? unmatched : unmatched.slice(0, BATCH_LIMIT);

    let matchedCount = 0;
    const details = [];

    for (const rec of toCheck) {
      const kn = rec[0];
      const name = rec[1];
      const searchRes = await tlPost(accessToken, 'companies.list', { filter: { term: name }, page: { size: 5 } });
      const candidates = searchRes.ok ? (searchRes.data.data || []) : [];
      const exactMatches = candidates.filter(function (c) { return normalizeName(c.name) === normalizeName(name); });

      if (exactMatches.length === 1) {
        const company = exactMatches[0];
        const infoRes = await tlPost(accessToken, 'companies.info', { id: company.id });
        const info = infoRes.ok ? (infoRes.data.data || {}) : {};
        let klanttype = null;
        (info.custom_fields || []).forEach(function (cf) {
          if (cf.definition && cf.definition.id === KLANTTYPE_FIELD_ID) klanttype = cf.value;
        });
        rec[10] = 1;
        if (klanttype) rec[4] = klanttype;
        companyIds[kn] = company.id;
        matchedCount++;
        details.push({ kn: kn, name: name, status: 'matched', klanttype: klanttype });
      } else {
        details.push({ kn: kn, name: name, status: candidates.length ? 'needs_review' : 'not_found', candidateCount: candidates.length });
      }
    }

    if (matchedCount > 0) {
      await saveDirectory(directory);
      await saveDataset('teamleader_company_ids', companyIds);
    }

    const stillUnmatchedCount = records.filter(function (r) { return r[10] === 0; }).length;

    res.status(200).json({
      checked: toCheck.length,
      matchedCount: matchedCount,
      stillUnmatchedCount: stillUnmatchedCount,
      details: details,
      directory: matchedCount > 0 ? directory : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
