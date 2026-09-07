// TEMPORARY diagnostic - checks contacts.info's full shape for a contact known to be linked to
// a company, to see whether it carries a company reference back (needed for a domain-matching
// path: search contacts.list by email, then resolve the contact back to its company). Delete
// after use.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const id = req.query.id || '59922381-d713-0351-b779-aab4d286acb8';
    const infoRes = await tlPost(accessToken, 'contacts.info', { id: id, includes: 'companies' });
    res.status(200).json({ ok: infoRes.ok, status: infoRes.status, data: infoRes.data.data || infoRes.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
