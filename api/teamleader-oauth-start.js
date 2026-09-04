// Redirects the user to Teamleader's own login/approve page (real OAuth, no secrets ever touch the browser).
module.exports = function handler(req, res) {
  const clientId = process.env.TEAMLEADER_CLIENT_ID;
  const redirectUri = `https://${req.headers.host}/api/teamleader-oauth-callback`;
  if (!clientId) {
    res.status(500).send('TEAMLEADER_CLIENT_ID is not set in Vercel environment variables.');
    return;
  }
  const url = `https://focus.teamleader.eu/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.writeHead(302, { Location: url });
  res.end();
};
