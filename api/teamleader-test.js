// TEMPORARY diagnostic - checks whether contacts.list filter:{company_id} works, and what a
// contact linked to a company looks like (to see if searching contacts by email domain, then
// following the contact back to its company, is a viable domain-matching path). Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds).slice(0, 10);

    const results = [];
    for (const kn of kns) {
      const companyId = companyIds[kn];
      const cRes = await tlPost(accessToken, 'contacts.list', { filter: { company_id: companyId }, page: { size: 3 } });
      const contacts = cRes.ok ? (cRes.data.data || []) : [];
      if (contacts.length) {
        results.push({ kn: kn, companyId: companyId, contactCount: contacts.length, sample: contacts[0] });
      }
      if (results.length >= 3) break;
    }

    res.status(200).json({ results: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
