// TEMPORARY diagnostic - tries alternate shapes for filtering companies.list by a custom field
// value (Klantnummer), since the array shape ({custom_fields:[{id,value}]}) returned the same
// generic default list as a deliberately nonsense filter key. Delete after use.
const { getAccessToken, tlPost, getDataset } = require('./_teamleader');

const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const kn = Object.keys(companyIds)[0];
    const expectedName = (await tlPost(accessToken, 'companies.info', { id: companyIds[kn] })).data.data.name;

    const shapeA = await tlPost(accessToken, 'companies.list', { filter: { custom_fields: { id: KLANTNUMMER_FIELD_ID, value: String(kn) } }, page: { size: 5 } });
    const shapeB = await tlPost(accessToken, 'companies.list', { filter: { [KLANTNUMMER_FIELD_ID]: String(kn) }, page: { size: 5 } });
    const shapeC = await tlPost(accessToken, 'companies.list', { filter: { custom_field_value: { custom_field_id: KLANTNUMMER_FIELD_ID, value: String(kn) } }, page: { size: 5 } });

    function summarize(r) { return { count: (r.data.data || []).length, names: (r.data.data || []).map(function (c) { return c.name; }) }; }

    res.status(200).json({
      kn: kn,
      expectedName: expectedName,
      shapeA_arrayForm: summarize(shapeA),
      shapeB_directKey: summarize(shapeB),
      shapeC_customFieldValue: summarize(shapeC)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

