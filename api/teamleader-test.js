// TEMPORARY diagnostic - checks companies.info's addresses array shape (for city/postal_code
// corroboration on a weak name match) across a few real companies. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds).slice(0, 5);

    const results = [];
    for (const kn of kns) {
      const infoRes = await tlPost(accessToken, 'companies.info', { id: companyIds[kn] });
      const d = infoRes.ok ? (infoRes.data.data || {}) : {};
      results.push({ kn: kn, name: d.name, addresses: d.addresses, telephones: d.telephones });
    }

    res.status(200).json({ results: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

