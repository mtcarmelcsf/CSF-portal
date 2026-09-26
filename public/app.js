const app = document.getElementById('app');
const logoutBtn = document.getElementById('logout');

const REQS = [
  ['dues', 'Dues'],
  ['service', 'Service Hours'],
  ['application', 'Application'],
];
const YEARS = [
  { grade: 10, label: 'Year 2', tris: 'Trimesters 2–3' },
  { grade: 11, label: 'Year 3', tris: 'Trimesters 1–3' },
  { grade: 12, label: 'Year 4', tris: 'Trimesters 1–3' },
];

let session = null; // { id, role, student, settings, terms }
let students = [];
let boardIds = [];
let openIds = new Set();
let tab = 'students';
let search = '';

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': session ? session.id : '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Grade a "Class of" year is in right now (12 = senior).
const currentGrade = classOf => 12 - (classOf - session.settings.seniorClass);
// School year label (e.g. "2025–26") for when this class was/will be in a grade.
function schoolYear(classOf, grade) {
  const end = classOf - (12 - grade);
  return `${end - 1}–${String(end).slice(-2)}`;
}
const termsFor = grade => session.terms.filter(t => t.grade === grade);
const isComplete = p => p && p.dues && p.service && p.application;

function termStatus(student, term) {
  if (term.grade > currentGrade(student.classOf)) return 'upcoming';
  return isComplete(student.progress[term.key]) ? 'done' : 'missing';
}

function countComplete(student) {
  return session.terms.filter(t => isComplete(student.progress[t.key])).length;
}

// ---------- login ----------
function renderLogin(error = '') {
  logoutBtn.hidden = true;
  app.innerHTML = '';
  app.appendChild(document.getElementById('login-tpl').content.cloneNode(true));
  const input = document.getElementById('login-id');
  document.getElementById('login-error').textContent = error;
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 7); });
  input.focus();
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    await login(input.value.trim());
  });
}

async function login(id) {
  try {
    session = await api('POST', '/login', { id });
    try { sessionStorage.setItem('csf-id', id); } catch {}
    logoutBtn.hidden = false;
    if (session.role === 'board') {
      tab = 'students';
      await loadBoardData();
    }
    render();
  } catch (err) {
    session = null;
    renderLogin(err.message);
  }
}

logoutBtn.addEventListener('click', () => {
  session = null;
  openIds.clear();
  try { sessionStorage.removeItem('csf-id'); } catch {}
  renderLogin();
});

// ---------- student progress view ----------
function progressHtml(student) {
  const done = countComplete(student);
  const total = session.terms.length;
  const pct = Math.round((done / total) * 100);
  let html = `
    <div class="student-head">
      <div>
        <h1>${esc(student.name)}</h1>
        <span class="class-badge">Class of ${student.classOf}</span>
        <span class="muted" style="margin-left:6px">ID ${student.id}</span>
      </div>
      <div class="summary">
        <div class="big">${done} / ${total}</div>
        <div class="muted">trimesters completed</div>
        <div class="bar"><span style="width:${pct}%"></span></div>
      </div>
    </div>`;

  for (const y of YEARS) {
    html += `<section class="year">
      <div class="year-title"><h2>${schoolYear(student.classOf, y.grade)}</h2><span class="muted">${y.label} · ${y.tris}</span></div>
      <div class="terms">`;
    for (const t of termsFor(y.grade)) {
      const status = termStatus(student, t);
      const p = student.progress[t.key] || {};
      const pill = { done: 'Complete', missing: 'Incomplete', upcoming: 'Upcoming' }[status];
      html += `<div class="term ${status === 'done' ? 'complete' : status}">
        <div class="term-head"><strong>Trimester ${t.tri}</strong><span class="pill ${status}">${pill}</span></div>`;
      for (const [key, label] of REQS) {
        const val = status === 'upcoming' && !p[key]
          ? '<span class="na">—</span>'
          : p[key] ? '<span class="ok">✓ Done</span>' : '<span class="no">✗ Missing</span>';
        html += `<div class="req"><span>${label}</span>${val}</div>`;
      }
      html += `</div>`;
    }
    html += `</div></section>`;
  }
  return html;
}

// ---------- board view ----------
async function loadBoardData() {
  [students, boardIds] = await Promise.all([api('GET', '/students'), api('GET', '/board')]);
}

function classOptions(selected) {
  const s = session.settings.seniorClass;
  const years = [s, s + 1, s + 2];
  if (selected && !years.includes(selected)) years.push(selected);
  return years.sort().map(y => `<option value="${y}" ${y === selected ? 'selected' : ''}>Class of ${y}</option>`).join('');
}

function studentsTabHtml() {
  let html = `
    <div class="card">
      <h3>Add a student</h3>
      <form id="add-form" class="add-form">
        <input name="sid" placeholder="7-digit ID" inputmode="numeric" maxlength="7" required>
        <input name="sname" placeholder="Full name" required>
        <select name="classOf">${classOptions(session.settings.seniorClass + 2)}</select>
        <button class="btn primary" type="submit">Add</button>
      </form>
      <p id="add-error" class="error"></p>
    </div>
    <div class="toolbar"><input id="search" placeholder="Search by name or ID" value="${esc(search)}"></div>`;

  const q = search.toLowerCase();
  const list = students
    .filter(s => !q || s.name.toLowerCase().includes(q) || s.id.includes(q))
    .sort((a, b) => a.classOf - b.classOf || a.name.localeCompare(b.name));

  if (!list.length) {
    return html + `<div class="empty">${students.length ? 'No matches.' : 'No students yet. Add one above.'}</div>`;
  }

  const groups = {};
  for (const s of list) (groups[s.classOf] = groups[s.classOf] || []).push(s);
  for (const classOf of Object.keys(groups).sort()) {
    const grad = Number(classOf) < session.settings.seniorClass ? ' · graduated' : '';
    html += `<div class="class-group"><h3>Class of ${classOf} <span class="muted">${groups[classOf].length} student${groups[classOf].length === 1 ? '' : 's'}${grad}</span></h3>`;
    for (const s of groups[classOf]) html += memberHtml(s);
    html += `</div>`;
  }
  return html;
}

function memberHtml(s) {
  const open = openIds.has(s.id);
  const done = countComplete(s);
  let html = `<div class="member ${open ? 'open' : ''}" data-id="${s.id}">
    <button class="member-row" data-action="toggle">
      <span><span class="name">${esc(s.name)}</span><span class="id">${s.id}</span></span>
      <span class="right"><span class="muted">${done}/${session.terms.length} complete</span><span class="chev">▶</span></span>
    </button>`;
  if (open) {
    html += `<div class="member-body"><div class="grid-wrap"><table class="checks">
      <thead><tr><th>Trimester</th>${REQS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Status</th></tr></thead><tbody>`;
    for (const y of YEARS) {
      for (const t of termsFor(y.grade)) {
        const p = s.progress[t.key] || {};
        const status = termStatus(s, t);
        html += `<tr class="${status === 'done' ? 'complete' : ''}">
          <td>${schoolYear(s.classOf, y.grade)} · Tri ${t.tri}</td>
          ${REQS.map(([k, l]) => `<td><input type="checkbox" aria-label="${l}" data-term="${t.key}" data-field="${k}" ${p[k] ? 'checked' : ''}></td>`).join('')}
          <td><span class="pill ${status}">${{ done: 'Complete', missing: 'Incomplete', upcoming: 'Upcoming' }[status]}</span></td>
        </tr>`;
      }
    }
    html += `</tbody></table></div>
      <div class="member-actions">
        <label>Class: <select data-action="class">${classOptions(s.classOf)}</select></label>
        <button class="btn danger small" data-action="remove">Remove student</button>
      </div></div>`;
  }
  return html + `</div>`;
}

function settingsTabHtml() {
  const s = session.settings.seniorClass;
  return `
    <div class="card settings-section">
      <h3>Class years</h3>
      <p class="muted">Set the graduating class for the current school year. Change this at the start of each new year, and every student moves up automatically.</p>
      <form id="class-form" class="inline-form">
        <label>Current seniors: Class of <input name="seniorClass" type="number" min="2000" max="2100" value="${s}" style="width:100px"></label>
        <button class="btn primary" type="submit">Save</button>
      </form>
      <p class="muted" style="margin-top:10px">Juniors: Class of ${s + 1} · Sophomores: Class of ${s + 2}</p>
      <p id="class-error" class="error"></p>
    </div>
    <div class="card settings-section">
      <h3>Board access</h3>
      <p class="muted">Board members can see every student, check off requirements, and change settings.</p>
      <form id="invite-form" class="inline-form">
        <input name="sid" placeholder="7-digit ID" inputmode="numeric" maxlength="7" required>
        <button class="btn primary" type="submit">Give board access</button>
      </form>
      <p id="invite-error" class="error"></p>
      <ul class="board-list">
        ${boardIds.map(id => {
          const st = students.find(x => x.id === id);
          return `<li><span>${id}${st ? ` · ${esc(st.name)}` : ''}${id === session.id ? '<span class="you">(you)</span>' : ''}</span>
            <button class="btn danger small" data-remove-board="${id}">Remove</button></li>`;
        }).join('')}
      </ul>
    </div>`;
}

function boardHtml() {
  const mine = students.find(s => s.id === session.id);
  const tabs = [['students', 'Students'], ...(mine ? [['mine', 'My Progress']] : []), ['settings', 'Settings']];
  if (!tabs.some(([k]) => k === tab)) tab = 'students';
  let body = '';
  if (tab === 'students') body = studentsTabHtml();
  else if (tab === 'mine') body = progressHtml(mine);
  else body = settingsTabHtml();
  return `<nav class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>${body}`;
}

// ---------- render + events ----------
function render() {
  if (!session) return renderLogin();
  if (session.role === 'student') {
    app.innerHTML = progressHtml(session.student);
    return;
  }
  app.innerHTML = boardHtml();
  bindBoard();
}

function replaceStudent(updated) {
  students = students.map(s => (s.id === updated.id ? updated : s));
}

function bindBoard() {
  app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      search = searchEl.value;
      const pos = searchEl.selectionStart;
      render();
      const el = document.getElementById('search');
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  const addForm = document.getElementById('add-form');
  if (addForm) {
    addForm.sid.addEventListener('input', () => { addForm.sid.value = addForm.sid.value.replace(/\D/g, '').slice(0, 7); });
    addForm.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const s = await api('POST', '/students', {
          id: addForm.sid.value.trim(), name: addForm.sname.value.trim(), classOf: Number(addForm.classOf.value),
        });
        students.push(s);
        toast(`Added ${s.name}`);
        render();
        document.querySelector('#add-form [name=sid]').focus();
      } catch (err) {
        document.getElementById('add-error').textContent = err.message;
      }
    });
  }

  app.querySelectorAll('.member').forEach(m => {
    const id = m.dataset.id;
    m.querySelector('[data-action=toggle]').addEventListener('click', () => {
      openIds.has(id) ? openIds.delete(id) : openIds.add(id);
      render();
    });
    m.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', async () => {
      try {
        replaceStudent(await api('PUT', `/students/${id}/progress`, { term: cb.dataset.term, field: cb.dataset.field, value: cb.checked }));
      } catch (err) { toast(err.message); }
      render();
    }));
    const classSel = m.querySelector('[data-action=class]');
    if (classSel) classSel.addEventListener('change', async () => {
      try { replaceStudent(await api('PATCH', `/students/${id}`, { classOf: Number(classSel.value) })); } catch (err) { toast(err.message); }
      render();
    });
    const rm = m.querySelector('[data-action=remove]');
    if (rm) rm.addEventListener('click', async () => {
      const s = students.find(x => x.id === id);
      if (!confirm(`Remove ${s.name} (${id}) from CSF? This deletes their progress.`)) return;
      try {
        await api('DELETE', `/students/${id}`);
        students = students.filter(x => x.id !== id);
        openIds.delete(id);
        toast(`Removed ${s.name}`);
      } catch (err) { toast(err.message); }
      render();
    });
  });

  const classForm = document.getElementById('class-form');
  if (classForm) classForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      session.settings = await api('PUT', '/settings', { seniorClass: Number(classForm.seniorClass.value) });
      toast('Class years updated');
      render();
    } catch (err) { document.getElementById('class-error').textContent = err.message; }
  });

  const invite = document.getElementById('invite-form');
  if (invite) invite.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      boardIds = await api('POST', '/board', { id: invite.sid.value.trim() });
      toast('Board access granted');
      render();
    } catch (err) { document.getElementById('invite-error').textContent = err.message; }
  });

  app.querySelectorAll('[data-remove-board]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.removeBoard;
    const self = id === session.id;
    if (!confirm(self ? 'Remove your own board access? You will be logged out.' : `Remove board access for ${id}?`)) return;
    try {
      boardIds = await api('DELETE', `/board/${id}`);
      if (self) return logoutBtn.click();
      render();
    } catch (err) { toast(err.message); }
  }));
}

// ---------- start ----------
let saved = null;
try { saved = sessionStorage.getItem('csf-id'); } catch {}
if (saved) login(saved); else renderLogin();
