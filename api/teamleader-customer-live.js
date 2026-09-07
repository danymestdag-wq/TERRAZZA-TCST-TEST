// Fetches a single customer's CURRENT contacts and deals straight from Teamleader, on demand,
// when their profile is opened. Replaces the frozen historical snapshot (the old `teamleader_contacts`
// and `teamleader_deals` dataset rows, captured once months ago via a one-time export and never
// refreshed) - any customer matched or any deal created after that snapshot showed up as empty,
// which looked broken but was really just stale data with no live path behind it. This endpoint is
// that live path. Deliberately scoped to one customer at a time - a full sweep across every
// matched customer would hit the same rate-limit/timeout ceiling as the sync batches, but a single
// profile view only costs a handful of calls.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

const KLANTTYPE_FIELD_ID = '094c7d72-6c35-020b-b453-766c4374b923';

module.exports = async function handler(req, res) {
  try {
    const kn = parseInt(req.query.kn);
    if (!kn) { res.status(400).json({ error: 'Missing kn' }); return; }

    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const companyId = companyIds[kn];
    if (!companyId) { res.status(200).json({ ok: true, matched: false }); return; }

    const accessToken = await getAccessToken();

    const infoRes = await tlPost(accessToken, 'companies.info', { id: companyId });
    const info = infoRes.ok ? (infoRes.data.data || {}) : {};
    let klanttype = null;
    (info.custom_fields || []).forEach(function (cf) {
      if (cf.definition && cf.definition.id === KLANTTYPE_FIELD_ID) klanttype = cf.value;
    });
    // Deal phases only come back on the deal as a bare id - a separate call maps that id to the
    // human-readable phase name ("Qualified", "Proposal sent", ...), same list for every deal so
    // it only needs fetching once, not once per deal.
    let phaseNames = {};
    const phasesRes = await tlPost(accessToken, 'dealPhases.list', {});
    if (phasesRes.ok) {
      (phasesRes.data.data || []).forEach(function (p) { phaseNames[p.id] = p.name; });
    }

    // filter:{company_id} is silently ignored by Teamleader (confirmed empirically - it just
    // returns a generic recent-deals list unrelated to the requested company, the same kind of
    // silent-fallback behavior already found with companies.list's filter.name). The real,
    // verified-working shape mirrors how the deal's own lead.customer field is structured.
    const dealsRes = await tlPost(accessToken, 'deals.list', { filter: { customer: { type: 'company', id: companyId } }, page: { size: 20 } });
    const deals = (dealsRes.ok ? (dealsRes.data.data || []) : []).map(function (d) {
      return {
        title: d.title,
        phase: (d.current_phase && phaseNames[d.current_phase.id]) || '',
        status: d.status,
        value: d.estimated_value ? d.estimated_value.amount : null,
        createdAt: d.created_at
      };
    });
    const contactsRes = await tlPost(accessToken, 'contacts.list', { filter: { company_id: companyId }, page: { size: 10 } });
    const contactStubs = contactsRes.ok ? (contactsRes.data.data || []) : [];
    const contacts = [];
    for (const c of contactStubs) {
      const cInfoRes = await tlPost(accessToken, 'contacts.info', { id: c.id });
      const cInfo = cInfoRes.ok ? (cInfoRes.data.data || {}) : {};
      const link = (cInfo.companies || []).find(function (l) { return l.company && l.company.id === companyId; });
      contacts.push({
        name: (c.first_name || '') + ' ' + (c.last_name || ''),
        position: link ? link.position : null,
        decisionMaker: link ? !!link.decision_maker : false,
        phone: (c.telephones || [])[0] ? c.telephones[0].number : null
      });
    }

    res.status(200).json({ ok: true, matched: true, klanttype: klanttype, deals: deals, contacts: contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
