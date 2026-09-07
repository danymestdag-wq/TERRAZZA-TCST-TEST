// TEMPORARY diagnostic - checks the exact response shape of deals.list (filtered by company_id)
// and confirms contacts.list + contacts.info's per-company position/decision_maker fields, so the
// real live-customer-details endpoint maps fields correctly on the first try. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds);
    let companyId = companyIds[kns[0]];
    let sampleKn = kns[0];

    // Prefer a company that actually has at least one deal, so the shape isn't just an empty array.
    for (const kn of kns.slice(0, 15)) {
      const dRes = await tlPost(accessToken, 'deals.list', { filter: { company_id: companyIds[kn] }, page: { size: 3 } });
      if (dRes.ok && (dRes.data.data || []).length) { companyId = companyIds[kn]; sampleKn = kn; break; }
    }

    const dealsRes = await tlPost(accessToken, 'deals.list', { filter: { company_id: companyId }, page: { size: 5 } });
    const contactsRes = await tlPost(accessToken, 'contacts.list', { filter: { company_id: companyId }, page: { size: 5 } });
    const contacts = contactsRes.ok ? (contactsRes.data.data || []) : [];
    let firstContactInfo = null;
    if (contacts.length) {
      const infoRes = await tlPost(accessToken, 'contacts.info', { id: contacts[0].id });
      firstContactInfo = infoRes.ok ? infoRes.data.data : null;
    }

    res.status(200).json({
      sampleKn: sampleKn,
      companyId: companyId,
      dealsOk: dealsRes.ok,
      deals: dealsRes.data.data,
      contacts: contacts,
      firstContactInfo: firstContactInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

