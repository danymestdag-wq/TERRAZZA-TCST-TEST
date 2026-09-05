// TEMPORARY diagnostic - tries looser search variants for a name to check if the exact-term
// search is too strict, or the company genuinely isn't in Teamleader at all. Delete after use.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  const name = req.query.name || '';
  try {
    const accessToken = await getAccessToken();
    const variants = [name, name.split(' ')[0], name.replace(/[.,]/g, ''), name.split(' ').slice(0, 2).join(' ')];
    const unique = [...new Set(variants)];
    const results = {};
    for (const v of unique) {
      const r = await tlPost(accessToken, 'companies.list', { filter: { term: v }, page: { size: 5 } });
      results[v] = { ok: r.ok, count: (r.data.data || []).length, names: (r.data.data || []).map(c => c.name) };
    }
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

