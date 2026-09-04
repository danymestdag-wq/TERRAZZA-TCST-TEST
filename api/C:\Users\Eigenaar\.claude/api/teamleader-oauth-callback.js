// Exchanges the one-time code Teamleader sent back for a token pair, stores the refresh
// token in Supabase (service-role key, bypasses RLS - this runs with no logged-in browser
// user), then bounces back into the app. The refresh token rotates on every use, so it is
// never put in a static env var - Supabase is the single place it lives from here on.
const SUPABASE_URL = 'https://mrktemhnhwqszamaphlp.supabase.co';

async function saveRefreshToken(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?on_conflict=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ id: 'teamleader_auth', payload: { refresh_token: refreshToken }, updated_at: new Date().toISOString() })
  });
  if (!res.ok) throw new Error('Supabase save failed: ' + res.status + ' ' + (await res.text()));
}

module.exports = async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    res.status(400).send('Missing ?code from Teamleader.');
    return;
  }
  const redirectUri = `https://${req.headers.host}/api/teamleader-oauth-callback`;
  try {
    const tokenRes = await fetch('https://focus.teamleader.eu/oauth2/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TEAMLEADER_CLIENT_ID,
        client_secret: process.env.TEAMLEADER_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    if (!tokenRes.ok) {
      res.status(500).send('Teamleader token exchange failed: ' + tokenRes.status + ' ' + (await tokenRes.text()));
      return;
    }
    const tokens = await tokenRes.json();
    await saveRefreshToken(tokens.refresh_token);
    res.writeHead(302, { Location: '/?tl_connected=1' });
    res.end();
  } catch (err) {
    res.status(500).send('Connect failed: ' + err.message);
  }
};
