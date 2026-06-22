// Vercel Serverless Function — TCMB Efektif Satış (BanknoteSelling) kurları
// Konum: proje kökünde  api/tcmb.js   ->  uç nokta:  /api/tcmb
// CommonJS biçimi: package.json olmadan da, "type":"module" olmadan da Vercel'de çalışır.
// Tarayıcıdan TCMB doğrudan çekilemez (CORS); bu fonksiyon sunucu tarafında çeker.

const https = require('https');

function getXml(url, redir) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FiyatYonetimi/1.0)' } }, (r) => {
      // tek yönlendirmeyi izle
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && !redir) {
        r.resume();
        const next = r.headers.location.startsWith('http') ? r.headers.location : ('https://www.tcmb.gov.tr' + r.headers.location);
        return resolve(getXml(next, true));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (c) => { data += c; });
      r.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(new Error('timeout')); });
  });
}

function grab(xml, kod) {
  const block = xml.match(new RegExp('<Currency[^>]*Kod="' + kod + '"[\\s\\S]*?</Currency>'));
  if (!block) return null;
  const m = block[0].match(/<BanknoteSelling>\s*([\d.,]+)\s*<\/BanknoteSelling>/);
  if (!m) return null;
  // TCMB binlik ayraç kullanmaz; tek ayraç ondalıktır (nokta veya virgül olabilir)
  let s = m[1].trim();
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = (lc > ld) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.replace(',', '.');
  const v = parseFloat(s);
  return isFinite(v) && v > 0 && v < 5000 ? v : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    const xml = await getXml('https://www.tcmb.gov.tr/kurlar/today.xml');
    const usd = grab(xml, 'USD');
    const eur = grab(xml, 'EUR');
    const td = xml.match(/Tarih="([^"]+)"/);
    if (!usd || !eur) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: 'parse', usd, eur }));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.statusCode = 200;
    return res.end(JSON.stringify({ usd, eur, tarih: td ? td[1] : '' }));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
};
