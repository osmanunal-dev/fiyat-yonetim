// Vercel Serverless Function — TCMB Efektif Satış (BanknoteSelling) kurları
// Konum: proje kökünde  api/tcmb.js   ->  uç nokta:  /api/tcmb
// Tarayıcı TCMB'yi doğrudan çekemez (CORS). Bu fonksiyon sunucu tarafında çeker,
// USD/EUR Efektif Satış değerlerini JSON döner. Aynı alan adı olduğu için CORS yok.

export default async function handler(req, res) {
  try {
    const r = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (FiyatYonetimi)' },
      cache: 'no-store',
    });
    if (!r.ok) return res.status(502).json({ error: 'tcmb-' + r.status });
    const xml = await r.text();

    const grab = (kod) => {
      const block = xml.match(new RegExp('<Currency[^>]*Kod="' + kod + '"[\\s\\S]*?</Currency>'));
      if (!block) return null;
      const m = block[0].match(/<BanknoteSelling>([\d.,]+)<\/BanknoteSelling>/);
      if (!m) return null;
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      return isFinite(v) && v > 0 ? v : null;
    };

    const usd = grab('USD');
    const eur = grab('EUR');
    const td = xml.match(/Tarih="([^"]+)"/);
    if (!usd || !eur) return res.status(502).json({ error: 'parse' });

    // 30 dk CDN cache (TCMB günde bir güncellenir)
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({ usd, eur, tarih: td ? td[1] : '' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
