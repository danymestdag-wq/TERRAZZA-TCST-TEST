// Bulk "write the Excel Klantnummer into Teamleader for every matched customer that doesn't
// already have it" job. Deliberately conservative about what counts as safe to write:
//   - field is empty/missing -> write it (the normal case for the ~1189 historically-matched
//     customers, whose Klantnummer was never pushed into Teamleader before this feature existed)
//   - field already holds the exact same Klantnummer -> skip, nothing to do
//   - field holds something ELSE -> skip and flag as needs_review rather than overwrite; a
//     mismatch is more likely a wrong company link than a value worth clobbering
// Paginated the same way as teamleader-sync.js (progress tracked in a dataset entry, so
// repeated calls make forward progress and nothing is ever silently skipped forever) and for
// the same reason - Vercel's function timeout - keep each batch small.
const { getAccessToken, tlPost, getDataset, saveDataset } = require('./_teamleader');

const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';
const BATCH_LIMIT = 15;

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const progress = (await getDataset('teamleader_klantnummer_progress')) || {};

    const allKns = Object.keys(companyIds);
    const todo = allKns.filter(function (kn) { return !progress[kn]; });
    // Oldest-attempted (never attempted) first; among never-attempted, no particular order needed
    // since this is a one-time backlog, not something that needs "newest first" like sync does.
    const toCheck = todo.slice(0, BATCH_LIMIT);

    let writtenCount = 0, alreadySetCount = 0, mismatchCount = 0, errorCount = 0;
    const details = [];

    for (const kn of toCheck) {
      const companyId = companyIds[kn];
      const infoRes = await tlPost(accessToken, 'companies.info', { id: companyId });
      if (!infoRes.ok) {
        // Only a genuine 404 "not found" means the stored id is actually stale (company deleted
        // or merged in Teamleader) - that won't fix itself by retrying, so mark it done. Anything
        // else (429 rate limit, 500, network hiccup) is transient - leave it unmarked so the next
        // batch retries it, rather than permanently flagging a perfectly valid company as broken.
        const isNotFound = infoRes.status === 404;
        if (isNotFound) {
          errorCount++;
          progress[kn] = { status: 'error', detail: infoRes.data, at: new Date().toISOString() };
        }
        details.push({ kn: kn, status: isNotFound ? 'error' : 'transient_error', detail: infoRes.data, httpStatus: infoRes.status });
        continue;
      }
      const info = infoRes.data.data || {};
      let currentValue = null;
      (info.custom_fields || []).forEach(function (cf) {
        if (cf.definition && cf.definition.id === KLANTNUMMER_FIELD_ID) currentValue = cf.value;
      });

      if (currentValue && String(currentValue) === String(kn)) {
        alreadySetCount++;
        progress[kn] = { status: 'already_set', at: new Date().toISOString() };
        details.push({ kn: kn, status: 'already_set' });
      } else if (currentValue && String(currentValue) !== String(kn)) {
        mismatchCount++;
        progress[kn] = { status: 'mismatch', existingValue: currentValue, at: new Date().toISOString() };
        details.push({ kn: kn, status: 'mismatch', existingValue: currentValue });
      } else {
        const updateRes = await tlPost(accessToken, 'companies.update', {
          id: companyId,
          custom_fields: [{ id: KLANTNUMMER_FIELD_ID, value: String(kn) }]
        });
        if (updateRes.ok) {
          writtenCount++;
          progress[kn] = { status: 'written', at: new Date().toISOString() };
          details.push({ kn: kn, status: 'written' });
        } else if (updateRes.status === 404) {
          errorCount++;
          progress[kn] = { status: 'error', detail: updateRes.data, at: new Date().toISOString() };
          details.push({ kn: kn, status: 'error', detail: updateRes.data });
        } else {
          // Transient (429/500/etc.) - leave unmarked so it's retried, same reasoning as above.
          details.push({ kn: kn, status: 'transient_error', detail: updateRes.data, httpStatus: updateRes.status });
        }
      }
    }

    await saveDataset('teamleader_klantnummer_progress', progress);

    const remaining = allKns.filter(function (kn) { return !progress[kn]; }).length;

    res.status(200).json({
      checked: toCheck.length,
      writtenCount: writtenCount,
      alreadySetCount: alreadySetCount,
      mismatchCount: mismatchCount,
      errorCount: errorCount,
      remaining: remaining,
      totalCompanies: allKns.length,
      details: details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
