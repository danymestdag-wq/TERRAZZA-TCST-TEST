// Manual search: given a free-text term, returns matching Teamleader companies so a salesperson
// can pick the right one by hand when "Sync with Teamleader" couldn't find a confident automatic
// match. Read-only - never writes anything. Enriches each candidate with city and whether it
// already has a DIFFERENT Klantnummer set (a useful warning before linking to the wrong company),
// which costs one extra companies.info call per result but this only runs a few times per click,
// not in a batch sweep, so the extra latency is fine.
const { getAccessToken, tlPost } = require('./_teamleader');

const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';

module.exports = async function handler(req, res) {
  try {
    const term = (req.query.term || '').trim();
    if (!term) { res.status(400).json({ error: 'Missing search term' }); return; }

    const accessToken = await getAccessToken();
    const searchRes = await tlPost(accessToken, 'companies.list', { filter: { term: term }, page: { size: 8 } });
    const candidates = searchRes.ok ? (searchRes.data.data || []) : [];

    const results = [];
    for (const c of candidates) {
      const infoRes = await tlPost(accessToken, 'companies.info', { id: c.id });
      const info = infoRes.ok ? (infoRes.data.data || {}) : {};
      const addr = ((info.addresses || [])[0] || {}).address || {};
      let existingKlantnummer = null;
      (info.custom_fields || []).forEach(function (cf) {
        if (cf.definition && cf.definition.id === KLANTNUMMER_FIELD_ID && cf.value) existingKlantnummer = cf.value;
      });
      results.push({ id: c.id, name: c.name, city: addr.city || null, existingKlantnummer: existingKlantnummer });
    }

    res.status(200).json({ results: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

