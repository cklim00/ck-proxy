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
      res.setHeader('Content-Type', hasCallback ? 'application/javascript' : 'application/json');
      res.status(200).send(text);
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  // ── 寫入類：直接用 Google Sheets API ─────────────────────────────────────
  if (action === 'quickCheckin') {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const SHEET_ID = '1Sy2xilDHEgs0s01wNctsc-1QwYCYar6NoRzxvGN8Zvs';

      // 防重複：讀最後 100 列
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: '出席紀錄!A:D',
      });
      const rows = readRes.data.values || [];
      const sid = params.sid || '';
      const studentId = params.studentId || '';
      for (let i = Math.max(1, rows.length - 100); i < rows.length; i++) {
        if (rows[i][0] === sid && String(rows[i][3]) === String(studentId)) {
          res.status(200).json({ ok: true, alreadySigned: true });
          return;
        }
      }

      // 寫入
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: '出席紀錄!A:I',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[
            sid,
            params.courseId || 'GN432',
            params.name || '',
            studentId,
            '',
            new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
            '出席',
            '語音點名',
            params.color || '#A88BEB'
          ]]
        }
      });

      res.status(200).json({ ok: true });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  res.status(400).json({ ok: false, error: 'unknown action' });
}
