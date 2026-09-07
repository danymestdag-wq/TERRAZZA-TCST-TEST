// TEMPORARY diagnostic - checks whether a given id is actually a contact (not a company),
// to explain "No Company found" errors from the Klantnummer bulk-write job. Delete after use.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  const id = req.query.id || '';
  try {
    const accessToken = await getAccessToken();
    const companyRes = await tlPost(accessToken, 'companies.info', { id: id });
    const contactRes = await tlPost(accessToken, 'contacts.info', { id: id });
    res.status(200).json({
      asCompany: { ok: companyRes.ok, status: companyRes.status, name: companyRes.data.data ? companyRes.data.data.name : null, error: companyRes.data.errors },
      asContact: { ok: contactRes.ok, status: contactRes.status, name: contactRes.data.data ? (contactRes.data.data.first_name + ' ' + contactRes.data.data.last_name) : null, error: contactRes.data.errors }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
