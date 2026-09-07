// Real "Sync with Teamleader" endpoint. For every customer not yet matched (matched=0 in the
// live directory), tries several signals - ordered from absolute proof down to weaker
// corroborating evidence - to find the right Teamleader company, and links it when there's a
// confident match. Anything ambiguous or not found is left alone, same conservative "only
// auto-link on strong evidence" rule used throughout this project's earlier manual contact-
// matching work.
//
// SIGNAL 0 - VAT number (absolute - tried first, if Excel has it):
// Confirmed empirically that companies.list DOES support `filter: { vat_number: X }` and finds
// an exact single match - unlike a custom-fields filter (see below), this one is real. Formats
// vary between Excel and Teamleader ("BE0448444163" vs "BE 0448.444.163"), so a few reasonable
// variants are tried (raw as typed, stripped-to-alphanumeric, and the Belgian dotted format seen
// on real data) - accepted only if exactly one company comes back for a given variant. A VAT hit
// is treated as absolute proof and short-circuits every other signal.
//
// SIGNAL 1 - company name:
// Real-world gotcha found testing this against live data: Teamleader's term search wants the
// term to closely match the stored name's tokens - "Corn.bak BV" (Excel) found nothing, only
// "Corn.bak" did (company is stored as "Corn.bak B.v."); "Niels Bulder Tuin en Parkmachines"
// (Excel) found nothing, only "Niels Bulder" did (company is stored as just "Niels Bulder").
// So: try the full name first, then progressively shorter word-prefixes, stopping at the first
// search that returns exactly one candidate. Two different confidence levels from there:
//   - an EXACT match once punctuation/spacing is stripped ("Corn.bak BV" == "Corn.bak B.v.") is
//     accepted immediately, same as before.
//   - a PREFIX-only match ("nielsbulder" prefixes "nielsbuldertuinenparkmachines") is real but
//     not 100% - Teamleader's own Klantnummer custom field (if this candidate already has our
//     Excel Klantnummer recorded - can't be searched for directly, see SIGNAL note below, but CAN
//     be read off a candidate we already found), the VAT number, city, postcode, or phone are
//     each checked against this specific candidate before trusting it. Corroborated by any one of
//     those -> accepted. Corroborated by none -> left as a candidate and the search moves on to
//     try email/domain/phone/contact-person instead of guessing.
//
// Klantnummer as a blind, independent search (i.e. "does ANY company already have this exact
// Klantnummer, regardless of name") was tried and does not work: companies.list silently ignores
// a `custom_fields` filter and returns its generic default list instead of erroring - confirmed
// by testing three different filter shapes and comparing against a deliberately nonsense filter
// key, which produced the exact same generic list. So Klantnummer can only be used as a
// confirmation check on a candidate found some other way (see SIGNAL 1's corroboration step),
// not as its own search.
//
// SIGNALS 2-5 - email, dedicated email domain, phone, contact person (added later, when name-only
// matching proved too limited - a lot of real customers use a trading name in the Excel sheet
// that doesn't resemble what's stored in Teamleader at all). All four go through the same path:
// search contacts.list by the value (Teamleader's term search covers contact name AND email, and
// - confirmed empirically - also matches a bare domain fragment like "janbogaerts.be" with no
// local part), and if EXACTLY ONE contact comes back, follow it to its company via contacts.info's
// `companies[].company.id` (confirmed present on real data - a contact carries a direct back-
// reference to the company it belongs to). Same conservative rule as name matching: more than one
// hit, or a contact not linked to exactly one company, is treated as no match rather than guessed.
//
// Email domain is deliberately restricted to "dedicated" domains - a shared free/ISP mail
// provider (gmail.com, hotmail.com, telenet.be, ...) tells us nothing about which company someone
// belongs to and would produce false positives, so those are skipped via FREEMAIL_DOMAINS.
//
// Phone matching only tries the number exactly as Teamleader would display it (the raw Excel
// value, lightly trimmed) - confirmed empirically that Teamleader's search matches a phone number
// formatted the way it's actually stored ("+32 2 582 80 47"), but a digits-only concatenation of
// the same number returned ZERO results while a differently-truncated digit string returned a
// coincidental hit. That's not reliable enough to trust for a SEARCH, so no digit-stripping is
// attempted there - only the value as typed in Excel. (Phone-as-corroboration, above, is different
// and safe: that's comparing two already-known values, not searching, so a loose digit-suffix
// comparison can't produce a false positive from an unrelated company.)
//
// Progress tracking (teamleader_sync_status dataset entry): a batch used to always re-check the
// same top-N unmatched customers forever if none of them matched, since "not matched" never
// changes their position in a plain Klantnummer sort. Deliberately NOT a permanent "unmatchable"
// flag either - Teamleader's own data changes over time, so a customer with nothing today might
// have a real match next month. Instead: every checked customer gets a checkedAt timestamp;
// never-checked customers go first (newest Klantnummer first), then the least-recently-checked
// ones - so every click makes real forward progress, and the whole backlog naturally loops back
// around for a fresh look once it's been fully swept, with no customer ever permanently written
// off.
const { getAccessToken, tlPost, getDirectory, saveDirectory, getDataset, saveDataset } = require('./_teamleader');

const KLANTTYPE_FIELD_ID = '094c7d72-6c35-020b-b453-766c4374b923';
const KLANTNUMMER_FIELD_ID = '330ba4c5-a6fe-0d35-855e-21e984b568a7';
// Each customer can now need several sequential lookups (VAT variants, name variants, a
// corroboration fetch, then email/domain/phone/contact fallbacks - each only attempted if the
// field is actually filled in, and each stops immediately on the first confident hit). That's a
// heavier worst case per customer than the original name-only version, so the batch is kept small
// to stay clear of Vercel's function timeout - just means more clicks to clear a big backlog.
const BATCH_LIMIT = 5;

const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.be', 'hotmail.nl', 'hotmail.fr', 'hotmail.de',
  'outlook.com', 'outlook.be', 'live.com', 'live.be', 'live.nl', 'msn.com', 'yahoo.com', 'yahoo.be',
  'yahoo.nl', 'yahoo.fr', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'ymail.com',
  'telenet.be', 'skynet.be', 'scarlet.be', 'base.be', 'proximus.be', 'pandora.be', 'tiscali.be',
  'chello.nl', 'ziggo.nl', 'kpnmail.nl', 'home.nl', 'planet.nl', 'xs4all.nl', 'online.nl', 'quicknet.nl',
  'wanadoo.fr', 'orange.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'gmx.com', 'gmx.net', 'web.de', 't-online.de'
]);

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function namesAreExactMatch(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  return !!na && na === nb;
}

function namesAreCloseMatch(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

function searchTermVariants(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const variants = [name];
  for (let n = Math.min(words.length - 1, 2); n >= 1; n--) {
    variants.push(words.slice(0, n).join(' '));
  }
  return [...new Set(variants)].filter(Boolean);
}

function emailDomain(email) {
  const m = String(email || '').trim().toLowerCase().match(/@([^@\s]+)$/);
  return m ? m[1] : null;
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function normalizeVat(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// A handful of reasonable re-formattings of whatever VAT string Excel has, since Teamleader's
// stored format ("BE 0448.444.163") rarely matches what's typed in a spreadsheet verbatim.
function vatSearchVariants(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const normalized = normalizeVat(trimmed);
  const variants = new Set([trimmed, normalized]);
  const beDigits = (normalized.match(/^BE(\d{10})$/) || normalized.match(/^(\d{10})$/) || [])[1];
  if (beDigits) {
    variants.add('BE ' + beDigits.slice(0, 4) + '.' + beDigits.slice(4, 7) + '.' + beDigits.slice(7, 10));
  }
  return [...variants].filter(Boolean);
}

async function findCompanyByVat(accessToken, vatRaw) {
  for (const variant of vatSearchVariants(vatRaw)) {
    const r = await tlPost(accessToken, 'companies.list', { filter: { vat_number: variant }, page: { size: 5 } });
    const candidates = r.ok ? (r.data.data || []) : [];
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

// Finds a company via a single contact search term (email, domain, phone, or contact name).
// Only accepts an exact, unambiguous chain: exactly one contact found, linked to exactly one
// company - anything else (0 or 2+ contacts, or a contact tied to multiple/no companies) is left
// alone rather than guessed.
async function companyViaContactSearch(accessToken, term) {
  const trimmed = String(term || '').trim();
  if (!trimmed) return { candidates: [] };
  const searchRes = await tlPost(accessToken, 'contacts.list', { filter: { term: trimmed }, page: { size: 5 } });
  const contacts = searchRes.ok ? (searchRes.data.data || []) : [];
  if (contacts.length !== 1) return { candidates: contacts };
  const infoRes = await tlPost(accessToken, 'contacts.info', { id: contacts[0].id });
  if (!infoRes.ok) return { candidates: contacts };
  const links = (infoRes.data.data || {}).companies || [];
  if (links.length !== 1 || !links[0].company) return { candidates: contacts };
  const companyRes = await tlPost(accessToken, 'companies.info', { id: links[0].company.id });
  if (!companyRes.ok || !companyRes.data.data) return { candidates: contacts };
  // companies.info (unlike companies.list) already includes custom_fields, so the caller can
  // skip re-fetching it just to read klanttype.
  return { candidates: contacts, company: companyRes.data.data, info: companyRes.data.data };
}

// Checks a single, already-found name-prefix candidate against every other piece of Excel data
// we have: our own Klantnummer already recorded on this company, VAT, city, postcode, phone.
// Any one hit is enough - this is confirmation of a candidate we already have, not a blind
// search, so it can safely use loose comparisons (e.g. phone digit-suffix) without risking a
// false positive pulled in from an unrelated company.
async function corroborateNameCandidate(accessToken, rec, candidate) {
  const infoRes = await tlPost(accessToken, 'companies.info', { id: candidate.id });
  if (!infoRes.ok) return null;
  const info = infoRes.data.data || {};

  const kn = rec[0];
  const alreadyHasOurKlantnummer = (info.custom_fields || []).some(function (cf) {
    return cf.definition && cf.definition.id === KLANTNUMMER_FIELD_ID && String(cf.value) === String(kn);
  });
  if (alreadyHasOurKlantnummer) return { info: info, reason: 'klantnummer' };

  const excelVat = rec[40];
  if (excelVat && info.vat_number && normalizeVat(excelVat) === normalizeVat(info.vat_number)) {
    return { info: info, reason: 'vat' };
  }

  const addr = ((info.addresses || [])[0] || {}).address || {};
  const excelCity = rec[2], excelPostcode = rec[31];
  if (excelCity && addr.city && String(excelCity).trim().toLowerCase() === String(addr.city).trim().toLowerCase()) {
    return { info: info, reason: 'city' };
  }
  if (excelPostcode && addr.postal_code && String(excelPostcode).trim() === String(addr.postal_code).trim()) {
    return { info: info, reason: 'postcode' };
  }

  const excelPhoneDigits = digitsOnly(rec[35]).slice(-7);
  if (excelPhoneDigits.length === 7) {
    const phoneMatches = (info.telephones || []).some(function (t) { return digitsOnly(t.number).endsWith(excelPhoneDigits); });
    if (phoneMatches) return { info: info, reason: 'phone' };
  }

  return { info: info, reason: null };
}

async function findCompanyMatch(accessToken, rec) {
  const name = rec[1];
  const contactperson = rec[34];
  const phone = rec[35];
  const email = rec[36];
  const vat = rec[40];

  if (vat) {
    const vatCompany = await findCompanyByVat(accessToken, vat);
    if (vatCompany) return { candidates: [vatCompany], company: vatCompany, matchedVia: 'vat' };
  }

  let nameCandidates = [];
  for (const term of searchTermVariants(name)) {
    const searchRes = await tlPost(accessToken, 'companies.list', { filter: { term: term }, page: { size: 5 } });
    const candidates = searchRes.ok ? (searchRes.data.data || []) : [];
    if (candidates.length === 0) continue;
    nameCandidates = candidates;
    if (candidates.length === 1) {
      if (namesAreExactMatch(candidates[0].name, name)) {
        return { candidates: candidates, company: candidates[0], matchedVia: 'name' };
      }
      if (namesAreCloseMatch(candidates[0].name, name)) {
        const corroboration = await corroborateNameCandidate(accessToken, rec, candidates[0]);
        if (corroboration && corroboration.reason) {
          return { candidates: candidates, company: candidates[0], info: corroboration.info, matchedVia: 'name+' + corroboration.reason };
        }
        // Prefix match only, and nothing else corroborates it - don't guess. Fall through to
        // try email/domain/phone/contact-person before giving up on this customer.
      }
    }
    break;
  }

  if (email) {
    const byEmail = await companyViaContactSearch(accessToken, email);
    if (byEmail.company) return { candidates: byEmail.candidates, company: byEmail.company, info: byEmail.info, matchedVia: 'email' };
  }

  const domain = emailDomain(email);
  if (domain && !FREEMAIL_DOMAINS.has(domain)) {
    const byDomain = await companyViaContactSearch(accessToken, domain);
    if (byDomain.company) return { candidates: byDomain.candidates, company: byDomain.company, info: byDomain.info, matchedVia: 'domain' };
  }

  if (phone) {
    const byPhone = await companyViaContactSearch(accessToken, phone);
    if (byPhone.company) return { candidates: byPhone.candidates, company: byPhone.company, info: byPhone.info, matchedVia: 'phone' };
  }

  if (contactperson) {
    const byContact = await companyViaContactSearch(accessToken, contactperson);
    if (byContact.company) return { candidates: byContact.candidates, company: byContact.company, info: byContact.info, matchedVia: 'contact' };
  }

  return { candidates: nameCandidates };
}

module.exports = async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();
    const directory = await getDirectory();
    const companyIds = (await getDataset('teamleader_company_ids')) || {};
    const syncStatus = (await getDataset('teamleader_sync_status')) || {};

    const records = directory.records;
    const onlyKn = req.query.kn ? parseInt(req.query.kn) : null;
    const unmatched = records.filter(function (r) { return r[10] === 0 && (onlyKn === null || r[0] === onlyKn); });
    // Never-checked first (newest Klantnummer first among those), then oldest-checked first -
    // guarantees forward progress instead of endlessly retrying the same stuck customers.
    unmatched.sort(function (a, b) {
      const aChecked = syncStatus[a[0]] ? syncStatus[a[0]].checkedAt : null;
      const bChecked = syncStatus[b[0]] ? syncStatus[b[0]].checkedAt : null;
      if (!aChecked && !bChecked) return b[0] - a[0];
      if (!aChecked) return -1;
      if (!bChecked) return 1;
      return aChecked < bChecked ? -1 : aChecked > bChecked ? 1 : 0;
    });
    const toCheck = onlyKn !== null ? unmatched : unmatched.slice(0, BATCH_LIMIT);

    let matchedCount = 0;
    const details = [];
    const now = new Date().toISOString();

    for (const rec of toCheck) {
      const kn = rec[0];
      const name = rec[1];
      const found = await findCompanyMatch(accessToken, rec);

      if (found.company) {
        const company = found.company;
        let info = found.info;
        if (!info) {
          const infoRes = await tlPost(accessToken, 'companies.info', { id: company.id });
          info = infoRes.ok ? (infoRes.data.data || {}) : {};
        }
        let klanttype = null;
        (info.custom_fields || []).forEach(function (cf) {
          if (cf.definition && cf.definition.id === KLANTTYPE_FIELD_ID) klanttype = cf.value;
        });
        rec[10] = 1;
        if (klanttype) rec[4] = klanttype;
        companyIds[kn] = company.id;
        delete syncStatus[kn];
        matchedCount++;
        details.push({ kn: kn, name: name, status: 'matched', matchedName: company.name, matchedVia: found.matchedVia, klanttype: klanttype });
      } else {
        const status = found.candidates.length ? 'needs_review' : 'not_found';
        syncStatus[kn] = { status: status, checkedAt: now, candidateCount: found.candidates.length };
        details.push({ kn: kn, name: name, status: status, candidateCount: found.candidates.length });
      }
    }

    await saveDataset('teamleader_sync_status', syncStatus);
    if (matchedCount > 0) {
      await saveDirectory(directory);
      await saveDataset('teamleader_company_ids', companyIds);
    }

    const stillUnmatchedCount = records.filter(function (r) { return r[10] === 0; }).length;

    res.status(200).json({
      checked: toCheck.length,
      matchedCount: matchedCount,
      stillUnmatchedCount: stillUnmatchedCount,
      details: details,
      directory: matchedCount > 0 ? directory : null,
      companyIds: matchedCount > 0 ? companyIds : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

