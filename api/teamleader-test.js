// TEMPORARY diagnostic - checks whether companies.list's term search also matches on email
// domain or website, to decide if domain-matching can reuse the existing search path or needs
// its own lookup. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

function domainOf(email) {
  const at = String(email || '').split('@')[1];
  return at ? at.toLowerCase() : null;
}

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds).slice(0, 40);

    const withDomain = [];
    for (const kn of kns) {
      const infoRes = await tlPost(accessToken, 'companies.info', { id: companyIds[kn] });
      const d = infoRes.ok ? (infoRes.data.data || {}) : {};
      const primaryEmail = (d.emails || [])[0] ? (d.emails || [])[0].email : null;
      const domain = domainOf(primaryEmail);
      if (domain || d.website) withDomain.push({ kn: kn, name: d.name, email: primaryEmail, domain: domain, website: d.website });
      if (withDomain.length >= 5) break;
    }

    let searchTest = null;
    if (withDomain.length) {
      const sample = withDomain[0];
      const term = sample.domain || sample.website;
      const searchRes = await tlPost(accessToken, 'companies.list', { filter: { term: term }, page: { size: 10 } });
      searchTest = {
        searchedTerm: term,
        expectedName: sample.name,
        ok: searchRes.ok,
        results: (searchRes.data.data || []).map(function (c) { return c.name; })
      };
    }

    res.status(200).json({ withDomain: withDomain, searchTest: searchTest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
