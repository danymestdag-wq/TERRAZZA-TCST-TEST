// TEMPORARY diagnostic - checks whether contacts.list term search works on a bare email domain
// (no local part) and on a digits-only phone number, since Teamleader's search may want an
// exact stored value rather than a fragment. Delete after use.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();

    const domainRes = await tlPost(accessToken, 'contacts.list', { filter: { term: 'janbogaerts.be' }, page: { size: 5 } });
    const domainHits = (domainRes.data.data || []).map(function (c) { return c.first_name + ' ' + c.last_name; });

    const phoneRaw = await tlPost(accessToken, 'contacts.list', { filter: { term: '+32 2 582 80 47' }, page: { size: 5 } });
    const phoneDigits = await tlPost(accessToken, 'contacts.list', { filter: { term: '32258280 47'.replace(/\s/g, '') }, page: { size: 5 } });
    const phoneLast9 = await tlPost(accessToken, 'contacts.list', { filter: { term: '258280 47'.replace(/\s/g, '') }, page: { size: 5 } });

    const nameRes = await tlPost(accessToken, 'contacts.list', { filter: { term: 'Filip Daelman' }, page: { size: 5 } });

    res.status(200).json({
      domainHits: domainHits,
      phoneRawCount: (phoneRaw.data.data || []).length,
      phoneDigitsCount: (phoneDigits.data.data || []).length,
      phoneLast9Count: (phoneLast9.data.data || []).length,
      phoneLast9Names: (phoneLast9.data.data || []).map(function (c) { return c.first_name + ' ' + c.last_name; }),
      nameHits: (nameRes.data.data || []).map(function (c) { return c.first_name + ' ' + c.last_name; })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
