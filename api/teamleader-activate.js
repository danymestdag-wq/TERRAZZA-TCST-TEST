// Real "Activate" endpoint. Writes the Excel Klantnummer into Teamleader's Klantnummer custom
// field on the matched company (a real, permanent write - only runs on an explicit per-customer
// click, never automatically), and returns a link into that company's Teamleader page so the
// salesperson can send the welcome email themselves from there. Does not send anything itself -
// Teamleader's API has no "send this general email" endpoint (confirmed earlier in this project),
// only sending tied to a Quotation document, which doesn't fit a welcome message.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';

module.exports = async function handler(req, res) {
  try {
    const kn = req.query.kn;
    if (!kn) { res.status(400).json({ error: 'Missing kn' }); return; }

    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const companyId = companyIds[kn];
    if (!companyId) {
      res.status(400).json({ error: 'No Teamleader company linked for this customer yet - run "Sync with Teamleader" first.' });
      return;
    }

    const accessToken = await getAccessToken();
    const updateRes = await tlPost(accessToken, 'companies.update', {
      id: companyId,
      custom_fields: [{ id: KLANTNUMMER_FIELD_ID, value: String(kn) }]
    });

    if (!updateRes.ok) {
      res.status(500).json({ error: 'Teamleader update failed (status ' + updateRes.status + ')', detail: updateRes.data });
      return;
    }

    res.status(200).json({ ok: true, companyId: companyId, companyUrl: 'https://focus.teamleader.eu/companies/' + companyId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
