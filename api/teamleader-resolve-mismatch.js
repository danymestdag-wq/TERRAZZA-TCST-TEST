// Resolves one Klantnummer mismatch after a human has looked at it: either overwrite
// Teamleader's value with the Excel Klantnummer for real, or dismiss (leave Teamleader as-is,
// just stop showing this row for review). Always single-item, so no batching/timeout concerns
// like the bulk sweep endpoints - a person is looking at one row at a time.
const { getAccessToken, tlPost, getDataset, saveDataset } = require('./_teamleader');

const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';

module.exports = async function handler(req, res) {
  try {
    const kn = req.query.kn;
    const action = req.query.action; // 'overwrite' or 'dismiss'
    if (!kn || (action !== 'overwrite' && action !== 'dismiss')) {
      res.status(400).json({ error: 'Missing kn or invalid action (must be overwrite or dismiss)' });
      return;
    }

    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const progress = (await getDataset('teamleader_klantnummer_progress')) || {};
    const companyId = companyIds[kn];
    if (!companyId) { res.status(400).json({ error: 'No Teamleader company linked for this customer.' }); return; }

    if (action === 'dismiss') {
      progress[kn] = Object.assign({}, progress[kn], { reviewed: true, reviewedAt: new Date().toISOString() });
      await saveDataset('teamleader_klantnummer_progress', progress);
      res.status(200).json({ ok: true, action: 'dismissed' });
      return;
    }

    const accessToken = await getAccessToken();
    const updateRes = await tlPost(accessToken, 'companies.update', {
      id: companyId,
      custom_fields: [{ id: KLANTNUMMER_FIELD_ID, value: String(kn) }]
    });
    if (!updateRes.ok) {
      res.status(500).json({ error: 'Teamleader update failed', detail: updateRes.data });
      return;
    }

    progress[kn] = { status: 'written', at: new Date().toISOString(), overwroteMismatch: true };
    await saveDataset('teamleader_klantnummer_progress', progress);
    res.status(200).json({ ok: true, action: 'overwritten' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
