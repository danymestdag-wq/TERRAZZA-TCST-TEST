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

    let writtenCount = 0, alreadySetCount = 0, mismatchCount = 0;
    const details = [];

    for (const kn of toCheck) {
      const companyId = companyIds[kn];
      const infoRes = await tlPost(accessToken, 'companies.info', { id: companyId });
      if (!infoRes.ok) {
        details.push({ kn: kn, status: 'error', detail: infoRes.data });
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
        } else {
          details.push({ kn: kn, status: 'error', detail: updateRes.data });
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
      remaining: remaining,
      totalCompanies: allKns.length,
      details: details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
