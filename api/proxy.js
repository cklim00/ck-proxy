export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwCVcFSTRhZSH3zse5WBFyR9HqZPjqhDpTTpephd3DrLZ1P_3LMYcOoSU0Q64Ya3WiD/exec';

  // req.url 直接取得完整 query string，最可靠
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const url = `${GAS_URL}?${queryString}`;

  console.log('轉發到 GAS：', url);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    const text = await response.text();
    console.log('GAS 回傳：', text.substring(0, 200));
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (e) {
    console.error('錯誤：', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
}
