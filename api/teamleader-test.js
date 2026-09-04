// TEMPORARY diagnostic endpoint - empirically verifies which Teamleader search filter shapes
// actually work before building real matching logic on top of assumptions. Delete once the
// real sync logic is confirmed working from this.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  const name = req.query.name || 'Kwekerij Ichtus Flowers & Plants';
  try {
    const accessToken = await getAccessToken();
    const attempts = {};

    attempts.companies_filter_name = await tlPost(accessToken, 'companies.list', { filter: { name }, page: { size: 5 } });
    attempts.companies_filter_term = await tlPost(accessToken, 'companies.list', { filter: { term: name }, page: { size: 5 } });
    attempts.contacts_filter_term = await tlPost(accessToken, 'contacts.list', { filter: { term: name }, page: { size: 5 } });

    const summary = {};
    for (const key in attempts) {
      const r = attempts[key];
      summary[key] = {
        ok: r.ok,
        status: r.status,
        count: (r.data.data || []).length,
        names: (r.data.data || []).map(x => x.name || (x.first_name + ' ' + x.last_name))
      };
    }
    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

