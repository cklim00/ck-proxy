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
    const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
    const url = `${GAS_URL}?${queryString}`;
    const hasCallback = queryString.includes('callback=');
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const text = await response.text();
      res.setHeader('Content-Type', hasCallback ? 'application/javascript' : 'application/json');
      res.status(200).send(text);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  // ── 寫入類：直接用 Google Sheets API + 回傳出席統計 ──────────────────────
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
      const sid       = params.sid       || '';
      const studentId = params.studentId || '';
      const name      = params.name      || '';
      const courseId  = params.courseId  || 'GN432';
      const color     = params.color     || '#A88BEB';

      // ── 防重複：讀出席紀錄 A:D ─────────────────────────────────────────
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: '出席紀錄!A:D',
      });
      const rows = readRes.data.values || [];
      for (let i = Math.max(1, rows.length - 150); i < rows.length; i++) {
        if (rows[i][0] === sid && String(rows[i][3]) === String(studentId)) {
          res.status(200).json({ ok: true, alreadySigned: true });
          return;
        }
      }

      // ── 寫入出席紀錄 ────────────────────────────────────────────────────
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: '出席紀錄!A:I',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[sid, courseId, name, studentId, '', now, '出席', '語音點名', color]] }
      });

      // ── 更新簽到場次實到人數（J欄）──────────────────────────────────────
      const sesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: '簽到場次!A:J',
      });
      const sesRows = sesRes.data.values || [];
      let sesRowIndex = -1;
      for (let i = 1; i < sesRows.length; i++) {
        if (sesRows[i][0] === sid) { sesRowIndex = i + 1; break; }
      }
      if (sesRowIndex > 0) {
        // 重新讀最新出席紀錄計算人數
        const atRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID, range: '出席紀錄!A:A',
        });
        const atRows = atRes.data.values || [];
        const presentCount = atRows.filter((r, i) => i > 0 && r[0] === sid).length;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `簽到場次!J${sesRowIndex}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[presentCount]] }
        });
      }

      // ── ✅ 計算該學生本課程出席統計 ─────────────────────────────────────
      // 1. 這個學生參加過幾場（包含今天）
      const allAtRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: '出席紀錄!A:D',
      });
      const allAtRows = allAtRes.data.values || [];
      const studentSessionIds = new Set();
      for (let i = 1; i < allAtRows.length; i++) {
        if (allAtRows[i][1] === courseId && String(allAtRows[i][3]) === String(studentId)) {
          studentSessionIds.add(allAtRows[i][0]);
        }
      }
      const attendanceCount = studentSessionIds.size;

      // 2. 這門課總共開了幾場
      const allSesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: '簽到場次!A:B',
      });
      const allSesRows = allSesRes.data.values || [];
      const totalSessions = allSesRows.filter((r, i) => i > 0 && r[1] === courseId).length;

      // 3. 出席率
      const attendanceRate = totalSessions > 0
        ? Math.round(attendanceCount / totalSessions * 100) : 100;

      res.status(200).json({
        ok: true,
        attendanceCount,   // 學生累計出席次數（含今天）
        totalSessions,     // 課程總場次
        attendanceRate,    // 出席率 %
      });

    } catch (e) {
      console.error('錯誤：', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  res.status(400).json({ ok: false, error: 'unknown action' });
}
