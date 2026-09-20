// Input validation shared by routes and tests
function validScore(s) { if (!Number.isInteger(s) || s < 1 || s > 45) throw new Error('Score must be a whole number from 1 to 45'); }
// Whitelists charity fields so admin requests can never write unexpected columns
function charityFields(b = {}) {
  if (!b.name || !String(b.name).trim()) throw new Error('Name is required');
  if (b.image_url && !/^https?:\/\//.test(b.image_url)) throw new Error('Image must be an http(s) link');
  const events = (Array.isArray(b.events) ? b.events : []).filter(e => e && e.title && e.date)
    .map(e => ({ title: String(e.title).slice(0, 120), date: String(e.date), description: String(e.description || '').slice(0, 300) }));
  return { name: String(b.name).trim().slice(0, 120), description: String(b.description || '').slice(0, 2000), image_url: b.image_url || null, featured: !!b.featured, events };
}
const isUuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
// YYYY-MM-DD, a real calendar date, not more than one day ahead (covers time zones)
function validDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) throw new Error('Enter a valid date');
  if (d > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new Error('Score date cannot be in the future');
}
module.exports = { validScore, charityFields, isUuid, validDate };
