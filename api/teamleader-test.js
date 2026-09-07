// TEMPORARY diagnostic - inspects the new_customer_queue dataset directly, plus checks whether
// the Klantnummers in it actually exist in the current directory and what their territory/matched
// state is. Delete after use.
const { getDataset, getDirectory } = require('./_teamleader');

module.exports = async function handler(req, res) {
  try {
    const queue = (await getDataset('new_customer_queue')) || [];
    const directory = await getDirectory();
    const byKn = {};
    directory.records.forEach(function (r) { byKn[r[0]] = r; });

    const queueDetails = queue.map(function (entry) {
      const r = byKn[entry.kn];
      return {
        kn: entry.kn,
        addedVersion: entry.addedVersion,
        addedAt: entry.addedAt,
        closed: !!entry.closed,
        foundInDirectory: !!r,
        name: r ? r[1] : null,
        territoryCode: r ? r[5] : null,
        matched: r ? r[10] : null
      };
    });

    res.status(200).json({
      queueLength: queue.length,
      directoryRecordCount: directory.records.length,
      queueDetails: queueDetails.slice(-30)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

