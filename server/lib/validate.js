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
module.exports = { validScore, charityFields };
