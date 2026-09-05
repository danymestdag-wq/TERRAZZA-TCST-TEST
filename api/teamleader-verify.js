// TEMPORARY - verifies a company's Klantnummer custom field value. Delete after use.
const { getAccessToken, tlPost } = require('./_teamleader');
module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const id = req.query.id;
    const infoRes = await tlPost(accessToken, 'companies.info', { id });
    const info = infoRes.data.data || {};
    const kn = (info.custom_fields || []).find(cf => cf.definition && cf.definition.id === '330ba4c5-a6fe-0d35-855e-21e984b568a7');
    res.status(200).json({ name: info.name, klantnummerField: kn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
