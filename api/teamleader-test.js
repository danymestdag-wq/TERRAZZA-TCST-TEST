// TEMPORARY diagnostic - the custom_fields filter shape returned an unrelated default list on
// the previous test (same silent-ignore symptom already seen with filter.name), so this checks
// whether companies.list's PROVEN filter.term search also matches a Klantnummer custom field
// value, or a vat_number - and finds a real company with a non-null vat_number to test that
// filter properly. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kns = Object.keys(companyIds).slice(0, 25);

    let vatSample = null;
    for (const kn of kns) {
      const infoRes = await tlPost(accessToken, 'companies.info', { id: companyIds[kn] });
      const d = infoRes.ok ? (infoRes.data.data || {}) : {};
      if (d.vat_number) { vatSample = { kn: kn, name: d.name, vat_number: d.vat_number }; break; }
    }

    let vatTermTest = null;
    let vatFieldFilterTest = null;
    if (vatSample) {
      const r1 = await tlPost(accessToken, 'companies.list', { filter: { term: vatSample.vat_number }, page: { size: 5 } });
      vatTermTest = { ok: r1.ok, count: (r1.data.data || []).length, names: (r1.data.data || []).map(function (c) { return c.name; }) };
      const r2 = await tlPost(accessToken, 'companies.list', { filter: { vat_number: vatSample.vat_number }, page: { size: 5 } });
      vatFieldFilterTest = { ok: r2.ok, count: (r2.data.data || []).length, names: (r2.data.data || []).map(function (c) { return c.name; }) };
    }

    const knTermTest = await tlPost(accessToken, 'companies.list', { filter: { term: String(kns[0]) }, page: { size: 5 } });

    // Sanity check: does an obviously nonsense filter key ALSO return this same unrelated
    // default list? If so, that confirms Teamleader silently ignores unrecognized filter keys
    // rather than erroring, which is what likely happened with custom_fields.
    const nonsenseTest = await tlPost(accessToken, 'companies.list', { filter: { this_is_not_a_real_filter_xyz: 'whatever' }, page: { size: 5 } });

    res.status(200).json({
      vatSample: vatSample,
      vatTermTest: vatTermTest,
      vatFieldFilterTest: vatFieldFilterTest,
      knTermTest: { ok: knTermTest.ok, count: (knTermTest.data.data || []).length, names: (knTermTest.data.data || []).map(function (c) { return c.name; }) },
      nonsenseTest: { ok: nonsenseTest.ok, count: (nonsenseTest.data.data || []).length, names: (nonsenseTest.data.data || []).map(function (c) { return c.name; }) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

