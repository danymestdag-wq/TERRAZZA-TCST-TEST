// Real "Sync with Teamleader" endpoint. For every customer not yet matched (matched=0 in the
// live directory), searches Teamleader by name and links it when there's a confident single
// match - confirmed working filter shape: companies.list with filter.term (NOT filter.name,
// which is silently ignored and returns an unrelated default list - verified empirically before
// building this, see api/teamleader-test.js). Anything ambiguous or not found is left alone,
// same conservative "only auto-link on strong evidence" rule used throughout this project's
// earlier manual contact-matching work.
//
// Real-world gotcha found testing this against live data: Teamleader's term search wants the
// term to closely match the stored name's tokens - "Corn.bak BV" (Excel) found nothing, only
// "Corn.bak" did (company is stored as "Corn.bak B.v."); "Niels Bulder Tuin en Parkmachines"
// (Excel) found nothing, only "Niels Bulder" did (company is stored as just "Niels Bulder").
// So: try the full name first, then progressively shorter word-prefixes, stopping at the first
// search that returns exactly one candidate. Acceptance itself stays strict either way - either
// an exact name match once punctuation/spacing is stripped ("Corn.bak BV" == "Corn.bak B.v."),
// or the shorter of the two names is a genuine, non-trivial (5+ char) prefix of the longer one
// ("nielsbulder" prefixes "nielsbuldertuinenparkmachines") - never a same-length fuzzy guess.
const { getAccessToken, tlPost, getDirectory, saveDirectory, getDataset, saveDataset } = require('./_teamleader');

const KLANTTYPE_FIELD_ID = '094c7d72-6c35-020b-b453-766c4374b923';
// Each customer can need up to 3 sequential search calls (full name, then shorter fallbacks)
// plus one companies.info call when matched - a batch of 20 was measured taking ~15-19s in
// practice, right at the edge of (and sometimes past) Vercel's function timeout. 10 keeps
// each click comfortably fast and reliable; just means more clicks to clear a big backlog.
const BATCH_LIMIT = 10;

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function namesAreCloseMatch(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

function searchTermVariants(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const variants = [name];
  for (let n = Math.min(words.length - 1, 2); n >= 1; n--) {
    variants.push(words.slice(0, n).join(' '));
  }
  return [...new Set(variants)].filter(Boolean);
}

async function findCompanyMatch(accessToken, name) {
  for (const term of searchTermVariants(name)) {
    const searchRes = await tlPost(accessToken, 'companies.list', { filter: { term: term }, page: { size: 5 } });
    const candidates = searchRes.ok ? (searchRes.data.data || []) : [];
    if (candidates.length === 0) continue;
    if (candidates.length > 1) return { candidates: candidates, ambiguous: true };
    if (namesAreCloseMatch(candidates[0].name, name)) return { candidates: candidates, company: candidates[0] };
    return { candidates: candidates, ambiguous: true };
  }
  return { candidates: [] };
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
      const found = await findCompanyMatch(accessToken, name);

      if (found.company) {
        const company = found.company;
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
        details.push({ kn: kn, name: name, status: 'matched', matchedName: company.name, klanttype: klanttype });
      } else {
        details.push({ kn: kn, name: name, status: found.candidates.length ? 'needs_review' : 'not_found', candidateCount: found.candidates.length });
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
