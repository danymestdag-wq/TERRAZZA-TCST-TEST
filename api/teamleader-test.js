// TEMPORARY diagnostic - checks (1) whether companies.info exposes a vat_number field, (2)
// whether companies.list can filter by vat_number, and (3) whether companies.list can filter by
// a custom_fields value (Klantnummer) - needed to decide if VAT/Klantnummer can become absolute,
// first-priority match signals. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds);
    const sampleKn = kns[0];
    const sampleCompanyId = companyIds[sampleKn];

    const infoRes = await tlPost(accessToken, 'companies.info', { id: sampleCompanyId });
    const info = infoRes.ok ? (infoRes.data.data || {}) : {};

    let vatFilterTest = null;
    if (info.vat_number) {
      const r = await tlPost(accessToken, 'companies.list', { filter: { vat_number: info.vat_number }, page: { size: 5 } });
      vatFilterTest = { ok: r.ok, status: r.status, count: (r.data.data || []).length, names: (r.data.data || []).map(function (c) { return c.name; }) };
    }

    const cfRes = await tlPost(accessToken, 'companies.list', { filter: { custom_fields: [{ id: KLANTNUMMER_FIELD_ID, value: String(sampleKn) }] }, page: { size: 5 } });
    const cfTest = { ok: cfRes.ok, status: cfRes.status, count: (cfRes.data.data || []).length, names: (cfRes.data.data || []).map(function (c) { return c.name; }) };

    res.status(200).json({
      sampleKn: sampleKn,
      sampleCompanyName: info.name,
      vat_number: info.vat_number,
      allTopLevelKeys: Object.keys(info),
      vatFilterTest: vatFilterTest,
      customFieldFilterTest: cfTest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

