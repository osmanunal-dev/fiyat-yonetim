// Vercel Serverless Function — TCMB güncel kurları (Efektif Satış)
// GET /api/kur  ->  { ok, date, usd:{forexSelling,banknoteSelling}, eur:{...}, source }
// Sunucu tarafından çekilir; tarayıcıda CORS sorunu olmaz.

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

function num(s) {
  if (s == null) return null;
  const v = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Belirli bir para birimi bloğundan (Kod="USD" vb.) alanları çıkarır
function pick(xml, kod) {
  const m = xml.match(new RegExp('<Currency[^>]*Kod="' + kod + '"[^>]*>([\\s\\S]*?)</Currency>', 'i'));
  if (!m) return {};
  const block = m[1];
  const get = (tag) => {
    const mm = block.match(new RegExp('<' + tag + '>\\s*([\\s\\S]*?)\\s*</' + tag + '>', 'i'));
    return mm ? num(mm[1]) : null;
  };
  const unit = get('Unit') || 1;
  const fx = get('ForexSelling');
  const bn = get('BanknoteSelling');
  return {
    forexSelling: fx ? fx / unit : null,
    banknoteSelling: bn ? bn / unit : null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Edge/CDN'de 30 dk önbellek, 60 dk stale-while-revalidate
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const r = await fetch(TCMB_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/xml,text/xml,*/*' },
    });
    if (!r.ok) throw new Error('TCMB HTTP ' + r.status);
    const xml = await r.text();
    if (xml.indexOf('BanknoteSelling') < 0) throw new Error('Beklenmeyen TCMB yanıtı');

    const dateM = xml.match(/Tarih="([^"]+)"/);
    const usd = pick(xml, 'USD');
    const eur = pick(xml, 'EUR');

    if (!(usd.banknoteSelling || usd.forexSelling) || !(eur.banknoteSelling || eur.forexSelling)) {
      throw new Error('USD/EUR bulunamadı');
    }

    res.status(200).json({
      ok: true,
      source: 'TCMB',
      date: dateM ? dateM[1] : null,
      usd,
      eur,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message || err) });
  }
}
