// TEMPORARY diagnostic - deals.list with filter:{company_id} returned the IDENTICAL deal list for
// two completely different companies, matching the same "silently ignored filter -> generic
// default list" pattern already found with companies.list's filter.name. Testing alternate filter
// shapes to find one that actually filters by company. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const companyIdA = companyIds['53'];
    const companyIdB = companyIds['3839'];

    async function tryShape(label, filterObj) {
      const r = await tlPost(accessToken, 'deals.list', { filter: filterObj, page: { size: 5 } });
      const deals = r.ok ? (r.data.data || []) : [];
      return {
        label: label,
        ok: r.ok,
        count: deals.length,
        customerIds: deals.map(function (d) { return d.lead && d.lead.customer ? d.lead.customer.id : null; })
      };
    }

    const results = [];
    results.push(await tryShape('company_id flat (A)', { company_id: companyIdA }));
    results.push(await tryShape('customer object (A)', { customer: { type: 'company', id: companyIdA } }));
    results.push(await tryShape('customer object (B)', { customer: { type: 'company', id: companyIdB } }));

    res.status(200).json({ companyIdA: companyIdA, companyIdB: companyIdB, results: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

