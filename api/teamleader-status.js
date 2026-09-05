// Lightweight connectivity check - confirms the OAuth connect flow actually works end to end
// before anything more complex (sync/activate) is trusted. Not linked from the UI yet.
const { getAccessToken, tlPost } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const result = await tlPost(accessToken, 'users.list', { page: { size: 5 } });
    res.status(200).json({
      connected: true,
      sampleUsers: (result.data.data || []).map(u => u.first_name + ' ' + u.last_name)
    });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
};
// deploy-trigger-test
