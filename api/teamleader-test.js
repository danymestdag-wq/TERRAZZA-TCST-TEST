// TEMPORARY diagnostic - inspect raw Teamleader company field shapes (emails, telephones,
// website) so the matching-signal-expansion logic in teamleader-sync.js uses correct field
// names. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds).slice(0, 3);

    const companies = [];
    for (const kn of kns) {
      const infoRes = await tlPost(accessToken, 'companies.info', { id: companyIds[kn] });
      const d = infoRes.ok ? (infoRes.data.data || {}) : {};
      companies.push({
        kn: kn,
        name: d.name,
        emails: d.emails,
        telephones: d.telephones,
        website: d.website
      });
    }

    let contactsTest = null;
    const testEmail = req.query.email;
    if (testEmail) {
      const cRes = await tlPost(accessToken, 'contacts.list', { filter: { term: testEmail }, page: { size: 5 } });
      contactsTest = { ok: cRes.ok, status: cRes.status, data: cRes.data.data };
    }

    res.status(200).json({ companies: companies, contactsTest: contactsTest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

