const { google } = require('googleapis');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const params = req.query;
  const action = params.action;

  // ── 讀取類：轉發給 GAS ────────────────────────────────────────────────────
  if (action === 'getOpenSession' || action === 'lookupStudent') {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbwCVcFSTRhZSH3zse5WBFyR9HqZPjqhDpTTpephd3DrLZ1P_3LMYcOoSU0Q64Ya3WiD/exec';
    const qs = new URLSearchParams(params).toString();
    try {
      const response = await fetch(`${GAS_URL}?${qs}`, { redirect: 'follow' });
      const text = await response.text();
      const hasCallback = qs.includes('callback=');
