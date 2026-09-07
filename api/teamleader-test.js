// TEMPORARY diagnostic - looks up action_points rows matching a specific orphaned list (one that
// was deleted locally before the Supabase-delete fix existed, so its rows were never actually
// removed from the shared database). Read-only dry run first - reports what would be deleted
// without touching anything. Delete after use.
const SUPABASE_URL = 'https://mrktemhnhwqszamaphlp.supabase.co';
function supaHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

module.exports = async function handler(req, res) {
  try {
    const label = 'Priority list — All territories + België, bought TMC';
    const version = 2;
    const url = SUPABASE_URL + '/rest/v1/action_points?list_label=eq.' + encodeURIComponent(label) + '&list_version=eq.' + version;
    const r = await fetch(url, { headers: supaHeaders() });
    const rows = await r.json();
    res.status(200).json({ ok: r.ok, status: r.status, matchCount: Array.isArray(rows) ? rows.length : null, sample: Array.isArray(rows) ? rows.slice(0, 5) : rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

