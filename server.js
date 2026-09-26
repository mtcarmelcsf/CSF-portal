// CSF Tracker — tiny zero-dependency server.
// Run: node server.js   (PORT env var optional, default 3000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initial board member(s). Only used the first time the database is created.
const SEED_BOARD = ['1916869'];

// Year 2 = sophomore (tri 2–3), year 3 = junior (tri 1–3), year 4 = senior (tri 1–3).
const TERMS = [
  { key: 'y2t2', grade: 10, tri: 2 },
  { key: 'y2t3', grade: 10, tri: 3 },
  { key: 'y3t1', grade: 11, tri: 1 },
  { key: 'y3t2', grade: 11, tri: 2 },
  { key: 'y3t3', grade: 11, tri: 3 },
  { key: 'y4t1', grade: 12, tri: 1 },
  { key: 'y4t2', grade: 12, tri: 2 },
  { key: 'y4t3', grade: 12, tri: 3 },
];
const TERM_KEYS = new Set(TERMS.map(t => t.key));
const FIELDS = new Set(['dues', 'service', 'application']);

// School year that ends in June: Sep 2026 -> 2027.
function defaultSeniorClass() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = { settings: { seniorClass: defaultSeniorClass() }, board: SEED_BOARD.slice(), students: {} };
    saveDb(db);
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

let db = loadDb();

const isId = v => typeof v === 'string' && /^\d{7}$/.test(v);
const isBoard = id => db.board.includes(id);

function studentView(id) {
  const s = db.students[id];
  return s && { id, name: s.name, classOf: s.classOf, progress: s.progress || {} };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Bad JSON')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const method = req.method;
  const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req);

  // Public: log in with a 7-digit ID.
  if (method === 'POST' && parts[0] === 'login') {
    const id = String(body.id || '').trim();
    if (!isId(id)) return send(res, 400, { error: 'Please enter a 7-digit ID.' });
    if (isBoard(id)) {
      return send(res, 200, { role: 'board', id, student: studentView(id) || null, settings: db.settings, terms: TERMS });
    }
    if (db.students[id]) {
      return send(res, 200, { role: 'student', id, student: studentView(id), settings: db.settings, terms: TERMS });
    }
    return send(res, 404, { error: "We couldn't find that ID. Ask a CSF board member to add you." });
  }

  // Everything below is board-only.
  const actor = String(req.headers['x-user-id'] || '');
  if (!isBoard(actor)) return send(res, 403, { error: 'Board access required.' });

  if (parts[0] === 'students') {
    const id = parts[1];
    if (method === 'GET' && !id) {
      return send(res, 200, Object.keys(db.students).map(studentView));
    }
    if (method === 'POST' && !id) {
      const sid = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      const classOf = Number(body.classOf);
      if (!isId(sid)) return send(res, 400, { error: 'Student ID must be 7 digits.' });
      if (!name) return send(res, 400, { error: 'Name is required.' });
      if (!Number.isInteger(classOf)) return send(res, 400, { error: 'Pick a class.' });
      if (db.students[sid]) return send(res, 409, { error: 'That ID is already on the list.' });
      db.students[sid] = { name, classOf, progress: {} };
      saveDb(db);
      return send(res, 201, studentView(sid));
    }
    if (!db.students[id]) return send(res, 404, { error: 'Student not found.' });
    if (method === 'DELETE' && parts.length === 2) {
      delete db.students[id];
      saveDb(db);
      return send(res, 200, { ok: true });
    }
    if (method === 'PATCH' && parts.length === 2) {
      const s = db.students[id];
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return send(res, 400, { error: 'Name is required.' });
        s.name = name;
      }
      if (body.classOf !== undefined) {
        const classOf = Number(body.classOf);
        if (!Number.isInteger(classOf)) return send(res, 400, { error: 'Invalid class.' });
        s.classOf = classOf;
      }
      saveDb(db);
      return send(res, 200, studentView(id));
    }
    if (method === 'PUT' && parts[2] === 'progress') {
      const { term, field, value } = body;
      if (!TERM_KEYS.has(term) || !FIELDS.has(field)) return send(res, 400, { error: 'Invalid checkbox.' });
      const s = db.students[id];
      s.progress = s.progress || {};
      s.progress[term] = s.progress[term] || {};
      s.progress[term][field] = !!value;
      saveDb(db);
      return send(res, 200, studentView(id));
    }
  }

  if (parts[0] === 'board') {
    if (method === 'GET') return send(res, 200, db.board);
    if (method === 'POST') {
      const id = String(body.id || '').trim();
      if (!isId(id)) return send(res, 400, { error: 'ID must be 7 digits.' });
      if (!isBoard(id)) db.board.push(id);
      saveDb(db);
      return send(res, 200, db.board);
    }
    if (method === 'DELETE' && parts[1]) {
      if (db.board.length <= 1) return send(res, 400, { error: "Can't remove the last board member." });
      db.board = db.board.filter(b => b !== parts[1]);
      saveDb(db);
      return send(res, 200, db.board);
    }
  }

  if (parts[0] === 'settings' && method === 'PUT') {
    const seniorClass = Number(body.seniorClass);
    if (!Number.isInteger(seniorClass) || seniorClass < 2000 || seniorClass > 2100) {
      return send(res, 400, { error: 'Enter a valid year, e.g. 2027.' });
    }
    db.settings.seniorClass = seniorClass;
    saveDb(db);
    return send(res, 200, db.settings);
  }

  send(res, 404, { error: 'Not found' });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, url); } catch (e) { send(res, 400, { error: e.message }); }
  } else {
    serveStatic(res, url.pathname);
  }
}).listen(PORT, () => console.log(`CSF Tracker running at http://localhost:${PORT}`));
