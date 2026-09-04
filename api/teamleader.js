// Shared helper for any /api function that needs to call Teamleader. Not a route itself
// (Vercel does not turn underscore-prefixed files in /api into endpoints).
const SUPABASE_URL = 'https://mrktemhnhwqszamaphlp.supabase.co';

function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

async function getStoredRefreshToken() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?id=eq.teamleader_auth&select=payload`, { headers: supaHeaders() });
  if (!res.ok) throw new Error('Could not read teamleader_auth from Supabase: ' + res.status);
  const rows = await res.json();
  if (!rows.length || !rows[0].payload || !rows[0].payload.refresh_token) {
    throw new Error('Teamleader is not connected yet - use "Connect to Teamleader" in Team & Access first.');
  }
  return rows[0].payload.refresh_token;
}

async function saveRefreshToken(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?on_conflict=id`, {
    method: 'POST',
    headers: { ...supaHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'teamleader_auth', payload: { refresh_token: refreshToken }, updated_at: new Date().toISOString() })
  });
  if (!res.ok) throw new Error('Supabase save failed: ' + res.status + ' ' + (await res.text()));
}

// Returns a fresh access_token, and immediately persists the newly-rotated refresh_token
// Teamleader hands back (each refresh token is single-use).
async function getAccessToken() {
  const refreshToken = await getStoredRefreshToken();
  const tokenRes = await fetch('https://focus.teamleader.eu/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TEAMLEADER_CLIENT_ID,
      client_secret: process.env.TEAMLEADER_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!tokenRes.ok) throw new Error('Teamleader token refresh failed: ' + tokenRes.status + ' ' + (await tokenRes.text()));
  const tokens = await tokenRes.json();
  await saveRefreshToken(tokens.refresh_token);
  return tokens.access_token;
}

async function tlPost(accessToken, path, body) {
  const res = await fetch(`https://api.focus.teamleader.eu/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getDirectory() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?id=eq.directory&select=payload`, { headers: supaHeaders() });
  if (!res.ok) throw new Error('Could not read directory from Supabase: ' + res.status);
  const rows = await res.json();
  if (!rows.length) throw new Error('No directory row in Supabase yet - upload an Excel file in the app first.');
  return rows[0].payload;
}

async function saveDirectory(directory) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?on_conflict=id`, {
    method: 'POST',
    headers: { ...supaHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'directory', payload: directory, updated_at: new Date().toISOString() })
  });
  if (!res.ok) throw new Error('Supabase save failed: ' + res.status + ' ' + (await res.text()));
}

async function getDataset(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?id=eq.${id}&select=payload`, { headers: supaHeaders() });
  if (!res.ok) throw new Error('Could not read ' + id + ' from Supabase: ' + res.status);
  const rows = await res.json();
  return rows.length ? rows[0].payload : null;
}

async function saveDataset(id, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dataset?on_conflict=id`, {
    method: 'POST',
    headers: { ...supaHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id, payload, updated_at: new Date().toISOString() })
  });
  if (!res.ok) throw new Error('Supabase save failed for ' + id + ': ' + res.status + ' ' + (await res.text()));
}

module.exports = { getAccessToken, tlPost, getDirectory, saveDirectory, getDataset, saveDataset };
