// TEMPORARY diagnostic - the "customer object" filter shape for deals.list returned 0 results for
// two real companies, which is ambiguous: either those companies just have no deals right now, or
// the shape is still wrong. This proves it one way or the other by taking a customer id that is
// KNOWN to appear on a real deal (pulled from the unfiltered/default list) and checking whether
// filtering by that exact id returns only that company's deal(s). Delete after use.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();

    const unfilteredRes = await tlPost(accessToken, 'deals.list', { page: { size: 1 } });
    const sampleDeal = unfilteredRes.ok ? (unfilteredRes.data.data || [])[0] : null;
    if (!sampleDeal) { res.status(200).json({ error: 'No deals at all in the account?' }); return; }
    const knownCustomerId = sampleDeal.lead.customer.id;

    async function tryShape(label, filterObj) {
      const r = await tlPost(accessToken, 'deals.list', { filter: filterObj, page: { size: 10 } });
      const deals = r.ok ? (r.data.data || []) : [];
      return {
        label: label, ok: r.ok, count: deals.length,
        allMatchExpected: deals.length > 0 && deals.every(function (d) { return d.lead && d.lead.customer && d.lead.customer.id === knownCustomerId; }),
        customerIds: deals.map(function (d) { return d.lead && d.lead.customer ? d.lead.customer.id : null; })
      };
    }

    const results = [];
    results.push(await tryShape('customer object', { customer: { type: 'company', id: knownCustomerId } }));
    results.push(await tryShape('company_id flat', { company_id: knownCustomerId }));
    results.push(await tryShape('customer_id flat', { customer_id: knownCustomerId }));

    res.status(200).json({ knownCustomerId: knownCustomerId, sampleDealTitle: sampleDeal.title, results: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

