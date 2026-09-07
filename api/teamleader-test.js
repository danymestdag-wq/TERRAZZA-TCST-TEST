// TEMPORARY cleanup - deletes the specific orphaned action_points rows confirmed by the prior
// dry run (144 rows, list "Priority list — All territories + België, bought TMC" v2, all owned
// by Nasier) - left behind because the list was deleted locally before the Supabase-delete fix
// existed. Delete after use.
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
    const r = await fetch(url, { method: 'DELETE', headers: { ...supaHeaders(), Prefer: 'return=representation' } });
    const deleted = await r.json();
    res.status(200).json({ ok: r.ok, status: r.status, deletedCount: Array.isArray(deleted) ? deleted.length : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

