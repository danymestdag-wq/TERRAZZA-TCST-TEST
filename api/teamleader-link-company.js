// Manually links one customer (by Klantnummer) to a specific Teamleader company the salesperson
// picked from the manual search results, for when "Sync with Teamleader" couldn't find it
// confidently on its own. Mirrors what a successful automatic match does (records the company
// id, marks the directory record matched, pulls klanttype if set) so this customer then behaves
// exactly like an automatically matched one - "Activate" is still a separate, explicit step that
// actually writes the Klantnummer into Teamleader.
const { getAccessToken, tlPost, getDirectory, saveDirectory, getDataset, saveDataset } = require('./_teamleader');

const KLANTTYPE_FIELD_ID = '094c7d72-6c35-020b-b453-766c4374b923';

module.exports = async function handler(req, res) {
  try {
    const kn = parseInt(req.query.kn);
    const companyId = req.query.companyId;
    if (!kn || !companyId) { res.status(400).json({ error: 'Missing kn or companyId' }); return; }

    const accessToken = await getAccessToken();
    const infoRes = await tlPost(accessToken, 'companies.info', { id: companyId });
    if (!infoRes.ok || !infoRes.data.data) { res.status(400).json({ error: 'Could not find that Teamleader company' }); return; }
    const info = infoRes.data.data;

    const directory = await getDirectory();
    const rec = directory.records.find(function (r) { return r[0] === kn; });
    if (!rec) { res.status(400).json({ error: 'Customer not found in directory' }); return; }

    let klanttype = null;
    (info.custom_fields || []).forEach(function (cf) {
      if (cf.definition && cf.definition.id === KLANTTYPE_FIELD_ID) klanttype = cf.value;
    });
    rec[10] = 1;
    if (klanttype) rec[4] = klanttype;

    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    companyIds[kn] = companyId;

    const syncStatus = (await getDataset('teamleader_sync_status')) || {};
    delete syncStatus[kn];

    await saveDirectory(directory);
    await saveDataset('teamleader_company_ids', companyIds);
    await saveDataset('teamleader_sync_status', syncStatus);

    res.status(200).json({ ok: true, companyName: info.name, directory: directory, companyIds: companyIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

