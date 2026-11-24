// SIMS NOSSEF Railaco — API server (Express).
// Business rules (grade calculation, payment allocation, schedule collisions,
// attendance versioning, RBAC + object scope, audit trail) are enforced here.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildSeed, computeFinal, situation, hashPassword, SCALE_MAX } from './seed.js';
import { openStore, DB_PATH } from './store.js';
import { REPORTS, buildRows, render } from './reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

// ---------- Persistence (SQLite) ----------
const store = openStore();
if (store.isEmpty()) {
  store.reset(buildSeed());
  console.log('[seed] database created at', DB_PATH);
}
let db = store.load();
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { store.persist(db); } catch (e) { console.error('[db] persist failed', e); }
  }, 100);
};
const nowIso = () => new Date().toISOString();
const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n, w = 4) => String(n).padStart(w, '0');
const nextCounter = (k) => (db.counters[k] = (db.counters[k] || 0) + 1);

// ---------- RBAC ----------
const ALL = '*';
const PERMS = {
  SUPER_ADMIN: [ALL],
  SCHOOL_ADMIN: ['school.view', 'school.manage_settings', 'user.view', 'user.create', 'user.update', 'user.disable', 'admission.*', 'student.*', 'guardian.*', 'staff.*', 'academic.view', 'schedule.view', 'attendance.view', 'attendance.correct', 'assessment.view', 'report.view', 'report.generate', 'library.view', 'asset.view', 'extracurricular.*', 'announcement.*', 'document.*', 'system.import', 'system.export', 'system.view_jobs', 'audit.view', 'discipline.view'],
  SECRETARY: ['student.*', 'guardian.*', 'admission.*', 'announcement.*', 'document.*', 'system.import'],
  PRINCIPAL: ['school.view', 'user.view', 'audit.view', 'admission.view', 'admission.decide', 'student.view', 'student.export', 'guardian.view', 'staff.view', 'academic.view', 'schedule.view', 'attendance.view', 'attendance.approve', 'assessment.view', 'grade.review', 'grade.reopen', 'report.*', 'finance.view', 'finance.export', 'counseling.view', 'discipline.view', 'library.view', 'asset.view', 'extracurricular.view', 'announcement.*', 'system.view_jobs', 'system.export'],
  CURRICULUM_ADMIN: ['academic.*', 'schedule.*', 'student.view', 'staff.view', 'attendance.view', 'attendance.correct', 'assessment.*', 'score.*', 'grade.finalize', 'grade.reopen', 'grade.review', 'report.*', 'announcement.*', 'system.import', 'system.view_jobs', 'extracurricular.view'],
  FINANCE_ADMIN: ['finance.*', 'student.view', 'announcement.view', 'system.export', 'system.view_jobs'],
  ADMISSION_OFFICER: ['admission.*', 'student.view', 'announcement.view'],
  TEACHER: ['student.view', 'schedule.view', 'attendance.view', 'attendance.record', 'assessment.view', 'score.record', 'grade.submit', 'library.view', 'announcement.view', 'extracurricular.view', 'staff.view'],
  HOMEROOM_TEACHER: ['student.view', 'schedule.view', 'attendance.view', 'attendance.record', 'assessment.view', 'score.record', 'grade.submit', 'report.view', 'report.generate', 'discipline.view', 'discipline.manage', 'counseling.summary', 'library.view', 'announcement.view', 'extracurricular.view', 'staff.view'],
  COUNSELOR: ['counseling.*', 'discipline.*', 'student.view', 'announcement.view'],
  LIBRARIAN: ['library.*', 'student.view', 'announcement.view'],
  ASSET_OFFICER: ['asset.*', 'announcement.view', 'academic.view'],
  STUDENT: ['self.view', 'announcement.view', 'leave.request', 'finance.upload_proof'],
  GUARDIAN: ['self.view', 'announcement.view', 'leave.request', 'finance.upload_proof'],
};
export function can(user, perm) {
  if (!user) return false;
  return user.roles.some((r) =>
    (PERMS[r] || []).some((p) => p === ALL || p === perm || (p.endsWith('.*') && perm.startsWith(p.slice(0, -1))))
  );
}

// ---------- Auth ----------
const sessions = new Map(); // token -> userId
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}
const publicUser = (u) => {
  const { passwordHash, ...rest } = u;
  return { ...rest, permissions: [...new Set(u.roles.flatMap((r) => PERMS[r] || []))] };
};

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use((req, _res, next) => {
  req.requestId = 'req-' + crypto.randomBytes(4).toString('hex');
  const token = (req.headers.authorization || '').replace('Bearer ', '') || (typeof req.query.t === 'string' ? req.query.t : '');
  const uid = sessions.get(token);
  req.user = uid ? db.users.find((u) => u.id === uid && u.status === 'ACTIVE') : null;
  next();
});

const fail = (res, status, code, message, extra = {}) => res.status(status).json({ ok: false, error: { code, message, ...extra } });
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const auth = (req, res, next) => (req.user ? next() : fail(res, 401, 'AUTH_REQUIRED', 'Sesi berakhir. Silakan masuk kembali.'));
const need = (perm) => (req, res, next) => (can(req.user, perm) ? next() : fail(res, 403, 'PERMISSION_DENIED', `Peran Anda tidak memiliki izin ${perm}.`));

function audit(req, eventType, target, before, after) {
  db.auditLogs.unshift({
    id: 'aud_' + nextCounter('audit'), at: nowIso(), actor: req.user ? req.user.username : 'public', eventType, target,
    before: before ?? null, after: after ?? null, requestId: req.requestId, ip: (req.ip || '').replace('::ffff:', '') || '127.0.0.1',
  });
}
function notify(target, event, title, body, link) {
  db.notifications.unshift({ id: 'nt_' + nextCounter('notification'), target, event, title, body, at: nowIso(), readBy: [], link });
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users.find((x) => x.username === String(username || '').trim().toLowerCase() || x.email === String(username || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u.passwordHash)) return fail(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Username atau kata sandi salah.');
  if (u.status !== 'ACTIVE') return fail(res, 403, 'AUTH_ACCOUNT_INACTIVE', 'Akun Anda tidak aktif. Hubungi administrator sekolah.');
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, u.id);
  u.lastLogin = nowIso();
  req.user = u;
  audit(req, 'USER_LOGIN', `users/${u.id}`, null, null);
  save();
  ok(res, { token, user: publicUser(u) });
});
app.post('/api/auth/logout', (req, res) => {
  sessions.delete((req.headers.authorization || '').replace('Bearer ', ''));
  ok(res, true);
});
app.get('/api/auth/me', auth, (req, res) => ok(res, publicUser(req.user)));
app.post('/api/auth/forgot', (req, res) => ok(res, { sent: true })); // Always generic response (no account enumeration)

// ---------- Bootstrap (scoped data) ----------
function scopedData(user) {
  const d = structuredClone(db);
  delete d.users;
  d.users = can(user, 'user.view') ? db.users.map(publicUser) : [];
  d.notifications = db.notifications
    .filter((n) => n.target === 'ALL' || n.target === `USER:${user.id}` || user.roles.some((r) => n.target === `ROLE:${r}`) || (user.profileType === 'GUARDIAN' && n.target === `GUARDIAN:${user.profileId}`))
    .map((n) => ({ ...n, read: n.readBy.includes(user.id) }));
  const isStudent = user.roles.includes('STUDENT');
  const isGuardian = user.roles.includes('GUARDIAN');
  if (isStudent || isGuardian) {
    const ids = isStudent ? [user.profileId] : db.guardians.find((g) => g.id === user.profileId)?.studentIds || [];
    const classIds = db.students.filter((s) => ids.includes(s.id)).map((s) => s.classId);
    d.students = d.students.filter((s) => ids.includes(s.id));
    d.guardians = d.guardians.filter((g) => g.studentIds.some((x) => ids.includes(x)));
    d.scores = d.scores.filter((s) => ids.includes(s.studentId) && termFinal(s));
    d.reportCards = d.reportCards.filter((r) => ids.includes(r.studentId) && r.status === 'PUBLISHED');
    d.invoices = d.invoices.filter((i) => ids.includes(i.studentId));
    d.payments = d.payments.filter((p) => ids.includes(p.studentId));
    d.loans = d.loans.filter((l) => l.borrowerType === 'STUDENT' && ids.includes(l.borrowerId));
    d.memberships = d.memberships.filter((m) => ids.includes(m.studentId));
    d.attendanceSessions = d.attendanceSessions.filter((a) => classIds.includes(a.classId)).map((a) => ({ ...a, records: Object.fromEntries(Object.entries(a.records).filter(([k]) => ids.includes(k))) }));
    d.leaveRequests = d.leaveRequests.filter((l) => ids.includes(l.studentId));
    d.schedule = d.schedule.filter((s) => classIds.includes(s.classId));
    d.nationalExams = d.nationalExams.filter((n) => ids.includes(n.studentId));
    for (const k of ['applicants', 'counselingCases', 'disciplineIncidents', 'auditLogs', 'pautaSubmissions', 'reportJobs', 'assets', 'alumni', 'promotions', 'staff']) d[k] = [];
    d.teachers = d.teachers.map((t) => ({ id: t.id, name: t.name, phone: t.phone, email: t.email, gender: t.gender, subjectIds: t.subjectIds }));
    return d;
  }
  if (!can(user, 'counseling.view')) {
    d.counselingCases = can(user, 'counseling.summary')
      ? d.counselingCases.map(({ chronology, followUps, summary, ...rest }) => ({ ...rest, summary: '[Restricted]', followUps: [] }))
      : [];
  }
  if (!can(user, 'audit.view')) d.auditLogs = [];
  if (!can(user, 'finance.view')) { d.payments = []; d.invoices = d.invoices.map((i) => ({ ...i })); }
  if (!can(user, 'admission.view')) d.applicants = [];
  return d;
}
const termFinal = (s) => {
  const tg = db.termGrades.find((t) => t.classId === s.classId && t.subjectId === s.subjectId && t.trimester === s.trimester);
  return tg && tg.status === 'FINALIZED';
};
app.get('/api/bootstrap', auth, (req, res) => ok(res, scopedData(req.user)));

// ---------- Generic writable collections ----------
const COLLECTION_PERMS = {
  students: 'student.update', guardians: 'guardian.update', teachers: 'staff.manage', staff: 'staff.manage', classes: 'academic.manage_class',
  subjects: 'academic.manage_subject', rooms: 'academic.manage_class', bellPeriods: 'academic.manage_year', trimesters: 'academic.manage_trimester',
  academicYears: 'academic.manage_year', teachingAssignments: 'academic.manage_class', feePlans: 'finance.manage_fee', announcements: 'announcement.publish',
  calendarEvents: 'academic.manage_year', libraryBooks: 'library.manage_catalog', libraryCopies: 'library.manage_catalog', assets: 'asset.manage',
  activities: 'extracurricular.manage', memberships: 'extracurricular.manage', disciplineIncidents: 'discipline.manage', counselingCases: 'counseling.manage',
  nationalExams: 'report.publish', invoices: 'finance.generate_invoice',
};
const PREFIX = { students: 'stu', guardians: 'grd', teachers: 'tch', staff: 'stf', classes: 'cls', subjects: 'sub', rooms: 'room', announcements: 'ann', calendarEvents: 'ev', libraryBooks: 'bk', libraryCopies: 'cp', assets: 'ast', activities: 'act', memberships: 'mem', disciplineIncidents: 'di', counselingCases: 'cc', teachingAssignments: 'ta', nationalExams: 'ne', feePlans: 'fp', bellPeriods: 'bp', trimesters: 'tri', academicYears: 'ay', invoices: 'inv' };

app.post('/api/c/:col', auth, (req, res) => {
  const { col } = req.params;
  const perm = COLLECTION_PERMS[col];
  if (!perm) return fail(res, 404, 'NOT_FOUND', 'Koleksi tidak dikenal.');
  if (!can(req.user, perm)) return fail(res, 403, 'PERMISSION_DENIED', `Peran Anda tidak memiliki izin ${perm}.`);
  const rec = { ...req.body, id: `${PREFIX[col]}_${crypto.randomBytes(3).toString('hex')}` };
  const v = validate(col, rec, null);
  if (v) return fail(res, 422, v.code, v.message);
  db[col].push(rec);
  audit(req, `${col.toUpperCase()}_CREATED`, `${col}/${rec.id}`, null, rec);
  save();
  ok(res, rec, 201);
});
app.patch('/api/c/:col/:id', auth, (req, res) => {
  const { col, id } = req.params;
  const perm = COLLECTION_PERMS[col];
  if (!perm) return fail(res, 404, 'NOT_FOUND', 'Koleksi tidak dikenal.');
  if (!can(req.user, perm)) return fail(res, 403, 'PERMISSION_DENIED', `Peran Anda tidak memiliki izin ${perm}.`);
  const rec = db[col].find((x) => x.id === id);
  if (!rec) return fail(res, 404, 'NOT_FOUND', 'Data tidak ditemukan.');
  const before = structuredClone(rec);
  const next = { ...rec, ...req.body, id };
  const v = validate(col, next, rec);
  if (v) return fail(res, 422, v.code, v.message);
  Object.assign(rec, next);
  audit(req, `${col.toUpperCase()}_UPDATED`, `${col}/${id}`, diffObj(before, rec), diffObj(rec, before));
  save();
  ok(res, rec);
});
function diffObj(a, b) {
  const out = {};
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = a[k];
  return out;
}
function validate(col, rec) {
  if (col === 'classes' && rec.homeroomTeacherId) {
    // INT-011..015: a teacher may be homeroom of only one class per year
    const clash = db.classes.find((c) => c.id !== rec.id && c.homeroomTeacherId === rec.homeroomTeacherId && c.yearId === rec.yearId);
    if (clash) return { code: 'HOMEROOM_ALREADY_ASSIGNED', message: `Guru ini sudah menjadi Profesor da Turma untuk ${clash.name}.` };
  }
  if (col === 'students' && rec.studentNo) {
    if (db.students.find((s) => s.id !== rec.id && s.studentNo === rec.studentNo)) return { code: 'STUDENT_NO_DUPLICATE', message: 'Nomor induk siswa sudah dipakai.' };
  }
  if (col === 'memberships') {
    const act = db.activities.find((a) => a.id === rec.activityId);
    const count = db.memberships.filter((m) => m.activityId === rec.activityId && m.status === 'ACTIVE' && m.id !== rec.id).length;
    if (act && rec.status === 'ACTIVE' && count >= act.capacity) return { code: 'EXTRACURRICULAR_FULL', message: 'Kuota anggota unit ini sudah penuh.' };
    if (db.memberships.find((m) => m.id !== rec.id && m.activityId === rec.activityId && m.studentId === rec.studentId && m.status === 'ACTIVE')) return { code: 'MEMBERSHIP_DUPLICATE', message: 'Siswa sudah menjadi anggota aktif unit ini.' };
  }
  return null;
}

// ---------- Users / Admin ----------
app.post('/api/users', auth, need('user.create'), (req, res) => {
  const { username, name, email, roles } = req.body;
  if (!username || !roles?.length) return fail(res, 422, 'VALIDATION_ERROR', 'Username dan peran wajib diisi.');
  if (db.users.find((u) => u.username === username)) return fail(res, 422, 'USERNAME_TAKEN', 'Username sudah digunakan.');
  const u = { id: 'usr_' + crypto.randomBytes(3).toString('hex'), username, name, email: email || `${username}@nossef-railaco.tl`, roles, profileType: null, profileId: null, status: 'ACTIVE', lastLogin: null, passwordHash: hashPassword('nossef2026'), roleValidFrom: '2026-01-01', roleValidUntil: '2026-12-31' };
  db.users.push(u);
  audit(req, 'USER_CREATED', `users/${u.id}`, null, { username, roles });
  save();
  ok(res, publicUser(u), 201);
});
app.patch('/api/users/:id', auth, need('user.update'), (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return fail(res, 404, 'NOT_FOUND', 'Pengguna tidak ditemukan.');
  const before = { status: u.status, roles: u.roles };
  const { status, roles, roleValidFrom, roleValidUntil, resetPassword } = req.body;
  if (roles && !can(req.user, 'role.manage') && !req.user.roles.includes('SCHOOL_ADMIN')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak boleh mengubah peran.');
  if (status) {
    u.status = status;
    if (status !== 'ACTIVE') for (const [t, uid] of sessions) if (uid === u.id) sessions.delete(t); // revoke sessions
  }
  if (roles) u.roles = roles;
  if (roleValidFrom) u.roleValidFrom = roleValidFrom;
  if (roleValidUntil) u.roleValidUntil = roleValidUntil;
  if (resetPassword) u.passwordHash = hashPassword('nossef2026');
  audit(req, roles ? 'ROLE_ASSIGNED' : status ? 'USER_STATUS_CHANGED' : resetPassword ? 'PASSWORD_RESET' : 'USER_UPDATED', `users/${u.id}`, before, { status: u.status, roles: u.roles });
  save();
  ok(res, publicUser(u));
});
app.patch('/api/school', auth, need('school.manage_settings'), (req, res) => {
  const before = { ...db.school };
  Object.assign(db.school, req.body);
  audit(req, 'SCHOOL_PROFILE_UPDATED', 'school', before, db.school);
  save();
  ok(res, db.school);
});
app.post('/api/notifications/read', auth, (req, res) => {
  const ids = req.body.ids || db.notifications.map((n) => n.id);
  db.notifications.forEach((n) => ids.includes(n.id) && !n.readBy.includes(req.user.id) && n.readBy.push(req.user.id));
  save();
  ok(res, true);
});

// ---------- Grades ----------
function teacherOwns(user, classId, subjectId) {
  if (can(user, 'score.revise') || user.roles.includes('SUPER_ADMIN')) return true;
  if (user.profileType !== 'TEACHER') return false;
  return db.teachingAssignments.some((a) => a.teacherId === user.profileId && a.classId === classId && a.subjectId === subjectId)
    || db.classes.some((c) => c.id === classId && c.homeroomTeacherId === user.profileId && user.roles.includes('HOMEROOM_TEACHER'));
}
function validScore(v) {
  return v === null || v === '' || v === undefined || (typeof v === 'number' && !Number.isNaN(v) && v >= 0 && v <= SCALE_MAX);
}
function upsertScores(req, classId, subjectId, trimester, rows) {
  const tg = db.termGrades.find((t) => t.classId === classId && t.subjectId === subjectId && t.trimester === trimester);
  if (tg && tg.status === 'FINALIZED') return { error: { status: 409, code: 'TERM_GRADE_LOCKED', message: 'Nilai trimestre ini sudah difinalisasi. Minta pembukaan kembali (reopen) ke Vise-Diretora.' } };
  const errors = [];
  const saved = [];
  rows.forEach((r, i) => {
    const stu = db.students.find((s) => s.id === r.studentId || s.studentNo === r.studentNo);
    if (!stu || stu.classId !== classId) { errors.push({ row: r.row ?? i + 1, field: 'studentNo', code: 'STUDENT_NOT_IN_CLASS', message: `Siswa ${r.studentNo || r.studentId} tidak terdaftar di rombel ini.` }); return; }
    for (const f of ['tpc', 't1', 't2', 'ezame']) {
      if (!validScore(r[f])) { errors.push({ row: r.row ?? i + 1, field: f, code: 'ASSESSMENT_SCORE_OUT_OF_RANGE', message: `Nilai ${f} harus 0 - ${SCALE_MAX}.` }); return; }
    }
    let sc = db.scores.find((s) => s.studentId === stu.id && s.subjectId === subjectId && s.trimester === trimester);
    if (!sc) { sc = { id: 'sc_' + crypto.randomBytes(4).toString('hex'), studentId: stu.id, classId, subjectId, trimester }; db.scores.push(sc); }
    for (const f of ['tpc', 't1', 't2', 'ezame']) if (f in r) sc[f] = r[f] === '' ? null : r[f];
    if ('observation' in r) sc.observation = r.observation;
    sc.final = computeFinal(sc);
    sc.situation = situation(sc.final);
    saved.push(sc);
  });
  if (!tg) db.termGrades.push({ id: `tg_${classId}_${subjectId}_${trimester}`, classId, subjectId, trimester, status: 'DRAFT', finalizedAt: null });
  return { saved, errors };
}
app.post('/api/grades/scores', auth, need('score.record'), (req, res) => {
  const { classId, subjectId, trimester, rows } = req.body;
  if (!teacherOwns(req.user, classId, subjectId)) return fail(res, 403, 'OBJECT_SCOPE_DENIED', 'Anda tidak ditugaskan mengajar mata pelajaran ini di rombel tersebut.');
  const r = upsertScores(req, classId, subjectId, Number(trimester), rows || []);
  if (r.error) return fail(res, r.error.status, r.error.code, r.error.message);
  if (r.errors.length) return fail(res, 422, 'VALIDATION_ERROR', 'Sebagian nilai tidak valid.', { rows: r.errors });
  audit(req, 'SCORES_RECORDED', `scores/${classId}/${subjectId}/T${trimester}`, null, { count: r.saved.length });
  save();
  ok(res, r.saved);
});
app.post('/api/grades/finalize', auth, (req, res) => {
  const { classId, subjectId, trimester, reopen, reason } = req.body;
  const perm = reopen ? 'grade.reopen' : 'grade.finalize';
  if (!can(req.user, perm) && !(perm === 'grade.finalize' && teacherOwns(req.user, classId, subjectId))) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin.');
  let tg = db.termGrades.find((t) => t.classId === classId && t.subjectId === subjectId && t.trimester === Number(trimester));
  if (!tg) { tg = { id: `tg_${classId}_${subjectId}_${trimester}`, classId, subjectId, trimester: Number(trimester), status: 'DRAFT' }; db.termGrades.push(tg); }
  if (!reopen) {
    const students = db.students.filter((s) => s.classId === classId && s.status === 'ACTIVE');
    const incomplete = students.filter((s) => { const sc = db.scores.find((x) => x.studentId === s.id && x.subjectId === subjectId && x.trimester === Number(trimester)); return !sc || sc.final == null; });
    if (incomplete.length) return fail(res, 422, 'TERM_GRADE_INCOMPLETE', `${incomplete.length} siswa belum memiliki nilai lengkap.`);
  } else if (!reason) return fail(res, 422, 'REASON_REQUIRED', 'Alasan pembukaan kembali wajib diisi.');
  const before = { status: tg.status };
  tg.status = reopen ? 'DRAFT' : 'FINALIZED';
  tg.finalizedAt = reopen ? null : nowIso();
  audit(req, reopen ? 'TERM_GRADE_REOPENED' : 'TERM_GRADE_FINALIZED', `termGrades/${tg.id}`, before, { status: tg.status, reason });
  save();
  ok(res, tg);
});
app.post('/api/pauta/submit', auth, need('grade.submit'), (req, res) => {
  const { classId, subjectId, trimester, fileName, fileId, rows } = req.body;
  if (!teacherOwns(req.user, classId, subjectId)) return fail(res, 403, 'OBJECT_SCOPE_DENIED', 'Anda tidak ditugaskan untuk mata pelajaran/rombel ini.');
  const valid = (rows || []).filter((r) => !r._errors?.length);
  const r = upsertScores(req, classId, subjectId, Number(trimester), valid);
  if (r.error) return fail(res, r.error.status, r.error.code, r.error.message);
  const protocol = `PV-NOSSEF-2026-${pad(nextCounter('protocol'), 4)}`;
  const sub = {
    id: 'pv_' + crypto.randomBytes(3).toString('hex'), protocol, teacherId: req.user.profileId, classId, subjectId, trimester: Number(trimester), fileName, fileId: fileId || null,
    rowsTotal: rows.length, rowsValid: r.saved.length, submittedAt: nowIso(), status: 'PENDING_DIRECTOR_REVIEW', reviewedBy: null, reviewNote: '',
  };
  db.pautaSubmissions.unshift(sub);
  const cls = db.classes.find((c) => c.id === classId); const subj = db.subjects.find((s) => s.id === subjectId);
  notify('ROLE:PRINCIPAL', 'grade.pauta.submitted', `Pauta foun: ${protocol}`, `${subj?.name} ${cls?.name} — ${req.user.name}`, '/grades/submissions');
  notify('ROLE:CURRICULUM_ADMIN', 'grade.pauta.submitted', `Pauta foun: ${protocol}`, `${subj?.name} ${cls?.name} — ${req.user.name}`, '/grades/submissions');
  audit(req, 'PAUTA_SUBMITTED', `pautaSubmissions/${sub.id}`, null, { protocol, status: sub.status, rows: sub.rowsValid });
  save();
  ok(res, { submission: sub, errors: r.errors }, 201);
});
app.post('/api/pauta/:id/review', auth, need('grade.review'), (req, res) => {
  const sub = db.pautaSubmissions.find((p) => p.id === req.params.id);
  if (!sub) return fail(res, 404, 'NOT_FOUND', 'Submisi tidak ditemukan.');
  const { status, note } = req.body;
  if (!['APPROVED', 'RETURNED_FOR_REVISION'].includes(status)) return fail(res, 422, 'VALIDATION_ERROR', 'Status tidak valid.');
  if (status === 'RETURNED_FOR_REVISION' && !note) return fail(res, 422, 'REASON_REQUIRED', 'Catatan revisi wajib diisi.');
  const before = { status: sub.status };
  Object.assign(sub, { status, reviewNote: note || '', reviewedBy: req.user.name, reviewedAt: nowIso() });
  const tUser = db.users.find((u) => u.profileType === 'TEACHER' && u.profileId === sub.teacherId);
  if (tUser) notify(`USER:${tUser.id}`, 'grade.pauta.reviewed', `${sub.protocol}: ${status === 'APPROVED' ? 'Aprovadu' : 'Fila ba revizaun'}`, note || '', '/grades/submissions');
  audit(req, 'PAUTA_REVIEWED', `pautaSubmissions/${sub.id}`, before, { status, note });
  save();
  ok(res, sub);
});

// ---------- Attendance ----------
app.post('/api/attendance/sessions', auth, (req, res) => {
  if (!can(req.user, 'attendance.record') && !can(req.user, 'attendance.correct')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin presensi.');
  const { classId, date, baseVersion, records, submit, clientMutationId } = req.body;
  if (clientMutationId && db.attendanceSessions.some((s) => s.lastMutationId === clientMutationId)) {
    return ok(res, db.attendanceSessions.find((s) => s.lastMutationId === clientMutationId)); // idempotent replay
  }
  const isHomeroom = db.classes.some((c) => c.id === classId && c.homeroomTeacherId === req.user.profileId);
  const teaches = db.teachingAssignments.some((a) => a.classId === classId && a.teacherId === req.user.profileId);
  if (!can(req.user, 'attendance.correct') && !isHomeroom && !teaches) return fail(res, 403, 'OBJECT_SCOPE_DENIED', 'Anda tidak mengajar di rombel ini.');
  let s = db.attendanceSessions.find((x) => x.classId === classId && x.date === date && x.mode === 'DAILY');
  if (s && baseVersion != null && baseVersion < s.version) {
    const conflicts = Object.entries(records || {}).filter(([sid, r]) => s.records[sid] && s.records[sid].status !== r.status && s.records[sid].changedAt && s.records[sid].changedVersion > baseVersion)
      .map(([sid, r]) => ({ studentId: sid, local: r, server: s.records[sid] }));
    if (conflicts.length) return fail(res, 409, 'ATTENDANCE_VERSION_CONFLICT', 'Data server telah berubah sejak Anda membuka sesi ini.', { conflicts, serverVersion: s.version });
  }
  if (s && s.status === 'SUBMITTED' && !can(req.user, 'attendance.correct') && !submit) {
    // allow resubmission by owner; corrections tracked by version
  }
  if (!s) {
    s = { id: 'att_' + crypto.randomBytes(3).toString('hex'), classId, date, mode: 'DAILY', subjectId: null, status: 'OPEN', version: 0, recordedBy: req.user.profileId, records: {} };
    db.attendanceSessions.push(s);
  }
  s.version += 1;
  for (const [sid, r] of Object.entries(records || {})) {
    if (!['PRESENT', 'SICK', 'PERMITTED', 'ABSENT', 'LATE'].includes(r.status)) return fail(res, 422, 'VALIDATION_ERROR', 'Status presensi tidak valid.');
    const prev = s.records[sid];
    if (!prev || prev.status !== r.status || prev.minutesLate !== r.minutesLate || prev.note !== r.note) s.records[sid] = { ...r, changedAt: nowIso(), changedBy: req.user.username, changedVersion: s.version };
    if (r.status === 'ABSENT' && (!prev || prev.status !== 'ABSENT')) {
      const stu = db.students.find((x) => x.id === sid);
      if (stu) notify(`GUARDIAN:${stu.guardianId}`, 'attendance.absent', 'Informasaun prezensa', `${stu.name.split(' ')[0]} la prezente ohin (${date}).`, '/guardian/home');
    }
  }
  if (submit) s.status = 'SUBMITTED';
  s.lastMutationId = clientMutationId || null;
  audit(req, submit ? 'ATTENDANCE_SUBMITTED' : 'ATTENDANCE_SAVED', `attendanceSessions/${s.id}`, null, { version: s.version, count: Object.keys(records || {}).length });
  save();
  ok(res, s);
});
app.post('/api/leave-requests', auth, need('leave.request'), (req, res) => {
  const { studentId, from, to, type, reason, attachmentFileId } = req.body;
  const allowed = req.user.roles.includes('STUDENT') ? [req.user.profileId] : db.guardians.find((g) => g.id === req.user.profileId)?.studentIds || [];
  if (!allowed.includes(studentId)) return fail(res, 403, 'OBJECT_SCOPE_DENIED', 'Tidak berhak atas siswa ini.');
  if (!from || !to || !reason) return fail(res, 422, 'VALIDATION_ERROR', 'Tanggal dan alasan wajib diisi.');
  const lr = { id: 'lv_' + crypto.randomBytes(3).toString('hex'), studentId, from, to, type, reason, attachmentFileId: attachmentFileId || null, status: 'PENDING', submittedBy: req.user.username, at: nowIso() };
  db.leaveRequests.push(lr);
  audit(req, 'LEAVE_REQUESTED', `leaveRequests/${lr.id}`, null, lr);
  save();
  ok(res, lr, 201);
});

// ---------- Schedule ----------
app.post('/api/schedule', auth, need('schedule.manage'), (req, res) => {
  const { id, classId, day, period, subjectId, teacherId, roomId, dryRun, exception } = req.body;
  const conflicts = [];
  db.schedule.forEach((s) => {
    if (s.id === id || s.day !== day || s.period !== period) return;
    if (s.teacherId === teacherId) conflicts.push({ code: 'SCHEDULE_TEACHER_CONFLICT', message: `Guru sudah mengajar ${db.classes.find((c) => c.id === s.classId)?.name} pada slot ini.` });
    if (s.roomId === roomId) conflicts.push({ code: 'SCHEDULE_ROOM_CONFLICT', message: `Ruang ${db.rooms.find((r) => r.id === roomId)?.code} sudah dipakai ${db.classes.find((c) => c.id === s.classId)?.name}.` });
    if (s.classId === classId) conflicts.push({ code: 'SCHEDULE_CLASS_CONFLICT', message: 'Rombel sudah memiliki pelajaran pada slot ini.' });
  });
  if (conflicts.length && !exception) return fail(res, 409, conflicts[0].code, conflicts[0].message, { conflicts });
  if (dryRun) return ok(res, { conflicts: [] });
  let s = id ? db.schedule.find((x) => x.id === id) : null;
  if (s) Object.assign(s, { classId, day, period, subjectId, teacherId, roomId, exception: exception ?? s.exception });
  else { s = { id: 'sch_' + crypto.randomBytes(3).toString('hex'), classId, day, period, subjectId, teacherId, roomId, exception: exception || null }; db.schedule.push(s); }
  audit(req, 'SCHEDULE_SAVED', `schedule/${s.id}`, null, s);
  save();
  ok(res, s);
});
app.post('/api/schedule/:id/exception', auth, need('schedule.manage'), (req, res) => {
  const s = db.schedule.find((x) => x.id === req.params.id);
  if (!s) return fail(res, 404, 'NOT_FOUND', 'Slot tidak ditemukan.');
  const { type, date, substituteTeacherId, note } = req.body;
  if (type === 'SUBSTITUTED') {
    const busy = db.schedule.find((x) => x.id !== s.id && x.day === s.day && x.period === s.period && x.teacherId === substituteTeacherId);
    if (busy) return fail(res, 409, 'SCHEDULE_TEACHER_CONFLICT', 'Guru pengganti sudah mengajar di slot yang sama.');
  }
  s.exception = type ? { type, date, substituteTeacherId: substituteTeacherId || null, note } : null;
  audit(req, 'SCHEDULE_EXCEPTION', `schedule/${s.id}`, null, s.exception);
  save();
  ok(res, s);
});
app.delete('/api/schedule/:id', auth, need('schedule.manage'), (req, res) => {
  const i = db.schedule.findIndex((x) => x.id === req.params.id);
  if (i < 0) return fail(res, 404, 'NOT_FOUND', 'Slot tidak ditemukan.');
  const [removed] = db.schedule.splice(i, 1);
  audit(req, 'SCHEDULE_REMOVED', `schedule/${removed.id}`, removed, null);
  save();
  ok(res, true);
});

// ---------- Finance ----------
function recomputeInvoice(inv) {
  inv.paid = round2(db.payments.filter((p) => p.status === 'VERIFIED').flatMap((p) => p.allocations).filter((a) => a.invoiceId === inv.id).reduce((s, a) => s + a.amount, 0));
  if (inv.status === 'VOID') return;
  inv.status = inv.paid >= inv.total ? 'PAID' : inv.paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}
app.post('/api/finance/payments', auth, need('finance.receive_payment'), (req, res) => {
  const { studentId, method, bank, amount, allocations, proofRef, proofFileId, depositDate, idempotencyKey } = req.body;
  if (!['CASH', 'BANK_RECEIPT'].includes(method)) return fail(res, 422, 'VALIDATION_ERROR', 'Metode pembayaran harus CASH atau BANK_RECEIPT.');
  if (method === 'BANK_RECEIPT') {
    if (!bank || !proofRef) return fail(res, 422, 'VALIDATION_ERROR', 'Bank dan nomor kuitansi bank wajib diisi.');
    if (!proofFileId || !store.fileMeta(proofFileId)) return fail(res, 422, 'PAYMENT_RECEIPT_FILE_REQUIRED', 'File kuitansi bank (foto/PDF) wajib diunggah.');
    if (db.payments.some((p) => p.method === 'BANK_RECEIPT' && p.bank === bank && p.proofRef === proofRef && p.status !== 'REJECTED')) return fail(res, 409, 'PAYMENT_RECEIPT_DUPLICATE', `Kuitansi ${bank} no. ${proofRef} sudah pernah dicatat.`);
  }
  if (idempotencyKey) { const ex = db.payments.find((p) => p.idempotencyKey === idempotencyKey); if (ex) return ok(res, ex); }
  const amt = round2(Number(amount));
  if (!(amt > 0)) return fail(res, 422, 'VALIDATION_ERROR', 'Nominal pembayaran harus lebih dari 0.');
  let allocs = allocations;
  if (!allocs?.length) {
    // auto-allocate oldest unpaid first
    let left = amt; allocs = [];
    db.invoices.filter((i) => i.studentId === studentId && ['UNPAID', 'PARTIALLY_PAID'].includes(i.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).forEach((i) => {
      if (left <= 0) return;
      const pendingAlloc = db.payments.filter((p) => p.status === 'PENDING').flatMap((p) => p.allocations).filter((a) => a.invoiceId === i.id).reduce((s, a) => s + a.amount, 0);
      const bal = round2(i.total - i.paid - pendingAlloc);
      if (bal <= 0) return;
      const a = Math.min(left, bal); allocs.push({ invoiceId: i.id, amount: round2(a) }); left = round2(left - a);
    });
    if (left > 0) return fail(res, 422, 'PAYMENT_OVERALLOCATION', `Nominal melebihi total sisa tagihan sebesar $${left.toFixed(2)}.`);
  }
  for (const a of allocs) {
    const inv = db.invoices.find((i) => i.id === a.invoiceId && i.studentId === studentId);
    if (!inv) return fail(res, 422, 'VALIDATION_ERROR', 'Invoice tidak valid.');
    if (round2(inv.total - inv.paid) < a.amount) return fail(res, 422, 'PAYMENT_OVERALLOCATION', `Alokasi ke ${inv.invoiceNo} melebihi sisa saldo.`);
  }
  if (round2(allocs.reduce((s, a) => s + a.amount, 0)) !== amt) return fail(res, 422, 'PAYMENT_OVERALLOCATION', 'Total alokasi harus sama dengan nominal pembayaran.');
  const isCash = method === 'CASH';
  const p = {
    id: 'pay_' + crypto.randomBytes(3).toString('hex'), paymentNo: `PAY-2026-${pad(nextCounter('payment'))}`, studentId, method, bank: method === 'BANK_RECEIPT' ? bank : null,
    amount: amt, status: isCash ? 'VERIFIED' : 'PENDING', allocations: allocs, proofRef: proofRef || null, proofFileId: proofFileId || null, depositDate: depositDate || null,
    receivedAt: nowIso(), receiptNo: isCash ? `RCP-2026-${pad(nextCounter('receipt'), 5)}` : null, receivedBy: req.user.name, reversalReason: null, idempotencyKey: idempotencyKey || null,
  };
  db.payments.unshift(p);
  allocs.forEach((a) => recomputeInvoice(db.invoices.find((i) => i.id === a.invoiceId)));
  if (!isCash) notify('ROLE:FINANCE_ADMIN', 'finance.payment.pending', `Kuitansi banku foun ${p.paymentNo}`, `${db.students.find((s) => s.id === studentId)?.name} — $${amt.toFixed(2)}`, '/finance?tab=pending');
  audit(req, isCash ? 'PAYMENT_RECEIVED' : 'BANK_RECEIPT_RECORDED', `payments/${p.id}`, null, { amount: amt, method, allocations: allocs });
  save();
  ok(res, p, 201);
});
app.post('/api/finance/payments/:id/:action', auth, (req, res) => {
  const p = db.payments.find((x) => x.id === req.params.id);
  if (!p) return fail(res, 404, 'NOT_FOUND', 'Pembayaran tidak ditemukan.');
  const { action } = req.params;
  const before = { status: p.status };
  if (action === 'verify') {
    if (!can(req.user, 'finance.verify_payment')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin verifikasi.');
    if (p.status !== 'PENDING') return fail(res, 409, 'PAYMENT_STATE_INVALID', 'Hanya pembayaran PENDING yang dapat diverifikasi.');
    for (const a of p.allocations) { const inv = db.invoices.find((i) => i.id === a.invoiceId); if (round2(inv.total - inv.paid) < a.amount) return fail(res, 422, 'PAYMENT_OVERALLOCATION', `Alokasi melebihi sisa saldo ${inv.invoiceNo}.`); }
    p.status = 'VERIFIED'; p.receiptNo = `RCP-2026-${pad(nextCounter('receipt'), 5)}`; p.verifiedBy = req.user.name; p.verifiedAt = nowIso();
    const stu = db.students.find((s) => s.id === p.studentId);
    if (stu) notify(`GUARDIAN:${stu.guardianId}`, 'finance.payment.verified', `Pagamentu ${p.paymentNo} verifikadu`, `Resibu ${p.receiptNo} — $${p.amount.toFixed(2)}`, '/guardian/home');
  } else if (action === 'reject') {
    if (!can(req.user, 'finance.verify_payment')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin.');
    if (p.status !== 'PENDING') return fail(res, 409, 'PAYMENT_STATE_INVALID', 'Hanya pembayaran PENDING yang dapat ditolak.');
    if (!req.body.reason) return fail(res, 422, 'REASON_REQUIRED', 'Alasan penolakan wajib diisi.');
    p.status = 'REJECTED'; p.rejectReason = req.body.reason;
  } else if (action === 'reverse') {
    if (!can(req.user, 'finance.reverse_payment')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin reversal.');
    if (p.status !== 'VERIFIED') return fail(res, 409, 'PAYMENT_STATE_INVALID', 'Hanya pembayaran VERIFIED yang dapat di-reverse.');
    if (!req.body.reason) return fail(res, 422, 'REASON_REQUIRED', 'Alasan reversal wajib diisi.');
    p.status = 'REVERSED'; p.reversalReason = req.body.reason; p.reversedAt = nowIso(); p.reversedBy = req.user.name;
  } else return fail(res, 404, 'NOT_FOUND', 'Aksi tidak dikenal.');
  p.allocations.forEach((a) => recomputeInvoice(db.invoices.find((i) => i.id === a.invoiceId)));
  audit(req, { verify: 'PAYMENT_VERIFIED', reject: 'PAYMENT_REJECTED', reverse: 'PAYMENT_REVERSED' }[action], `payments/${p.id}`, before, { status: p.status, reason: req.body.reason });
  save();
  ok(res, p);
});
app.post('/api/finance/invoices/generate', auth, need('finance.generate_invoice'), (req, res) => {
  const { period, etapa, dueDate, dryRun } = req.body;
  if (!period) return fail(res, 422, 'VALIDATION_ERROR', 'Periode wajib diisi.');
  const created = [];
  let skipped = 0;
  db.students.filter((s) => s.status === 'ACTIVE').forEach((s) => {
    if (db.invoices.some((i) => i.studentId === s.id && i.period === period && i.status !== 'VOID')) { skipped++; return; } // no duplicates
    const fp = db.feePlans.find((f) => f.grade === s.grade);
    const amt = etapa === 1 ? fp.etapa1 : etapa === 2 ? fp.etapa2 : round2(fp.total / 10);
    const pct = s.scholarship ? db.scholarshipTypes.find((x) => x.code === s.scholarship).discountPct : 0;
    const discount = round2((amt * pct) / 100);
    created.push({ id: 'inv_' + crypto.randomBytes(3).toString('hex'), invoiceNo: '', studentId: s.id, period, etapa, subtotal: amt, discount, total: round2(amt - discount), paid: 0, status: round2(amt - discount) === 0 ? 'PAID' : 'UNPAID', dueDate: dueDate || '2026-12-31', issuedAt: nowIso().slice(0, 10) });
  });
  const total = round2(created.reduce((s, i) => s + i.total, 0));
  if (dryRun) return ok(res, { count: created.length, skipped, total, sample: created.slice(0, 8) });
  created.forEach((i) => { i.invoiceNo = `INV-2026-${pad(nextCounter('invoice'), 5)}`; db.invoices.push(i); });
  audit(req, 'INVOICES_GENERATED', 'invoices', null, { period, count: created.length, total });
  save();
  ok(res, { count: created.length, skipped, total });
});
app.post('/api/finance/invoices/:id/void', auth, need('finance.generate_invoice'), (req, res) => {
  const inv = db.invoices.find((i) => i.id === req.params.id);
  if (!inv) return fail(res, 404, 'NOT_FOUND', 'Invoice tidak ditemukan.');
  if (inv.paid > 0) return fail(res, 409, 'INVOICE_HAS_PAYMENTS', 'Invoice yang sudah memiliki pembayaran tidak boleh di-void. Lakukan reversal dahulu.');
  if (!req.body.reason) return fail(res, 422, 'REASON_REQUIRED', 'Alasan void wajib diisi.');
  inv.status = 'VOID'; inv.voidReason = req.body.reason;
  audit(req, 'INVOICE_VOIDED', `invoices/${inv.id}`, { status: 'UNPAID' }, { status: 'VOID', reason: req.body.reason });
  save();
  ok(res, inv);
});

// ---------- Admissions ----------
app.post('/api/public/admissions/apply', (req, res) => {
  const a = req.body || {};
  if (!a.name || !a.birthDate || !a.guardian?.name || !a.guardian?.phone) return fail(res, 422, 'VALIDATION_ERROR', 'Nama, tanggal lahir, dan data wali wajib diisi.');
  if (a.avgScore !== undefined && a.avgScore !== '' && !(Number(a.avgScore) >= 0 && Number(a.avgScore) <= SCALE_MAX)) return fail(res, 422, 'VALIDATION_ERROR', `Nilai rata-rata harus 0 - ${SCALE_MAX}.`);
  if (!a.draft && (a.documents || []).filter((d) => d.fileId && store.fileMeta(d.fileId)).length < 3) return fail(res, 422, 'ADMISSION_DOCUMENTS_REQUIRED', 'Ijazah, akta kelahiran, dan pasfoto wajib diunggah sebelum pendaftaran resmi dikirim.');
  const period = db.admissionPeriods.find((p) => p.status === 'OPEN');
  if (!period) return fail(res, 409, 'ADMISSION_PERIOD_CLOSED', 'Periode pendaftaran sedang ditutup.');
  const dup = db.applicants.find((x) => x.name.toLowerCase() === a.name.toLowerCase() && x.birthDate === a.birthDate && x.periodId === period.id);
  if (dup) return fail(res, 409, 'APPLICANT_DUPLICATE', `Pendaftar dengan nama dan tanggal lahir yang sama sudah terdaftar (${dup.regNo}).`);
  const rec = {
    id: 'app_' + crypto.randomBytes(3).toString('hex'), regNo: `REG-2026-${pad(nextCounter('applicant'))}`, accessToken: String(1000 + Math.floor(Math.random() * 9000)), periodId: period.id,
    name: a.name, gender: a.gender, birthPlace: a.birthPlace, birthDate: a.birthDate, origin: a.origin, phone: a.phone, email: a.email, address: a.address, majorPref: a.majorPref, avgScore: Number(a.avgScore) || null,
    guardian: a.guardian, documents: (a.documents || []).map((d) => ({ type: d.type, label: d.label, fileName: d.fileName || '', sizeKb: d.sizeKb || 0, fileId: d.fileId && store.fileMeta(d.fileId) ? d.fileId : null, status: d.fileId ? 'PENDING' : 'MISSING' })), testScore: null, rank: null, status: a.draft ? 'DRAFT' : 'SUBMITTED', submittedAt: nowIso(), decisionNote: '',
  };
  db.applicants.push(rec);
  audit(req, 'APPLICANT_SUBMITTED', `applicants/${rec.id}`, null, { regNo: rec.regNo });
  notify('ROLE:ADMISSION_OFFICER', 'admission.submitted', `Pendaftar foun ${rec.regNo}`, rec.name, '/admissions/applicants');
  save();
  ok(res, { regNo: rec.regNo, accessToken: rec.accessToken, status: rec.status }, 201);
});
// Recover a forgotten registration number: name + birth date + guardian phone must all match.
app.post('/api/public/admissions/lookup', (req, res) => {
  const { name, birthDate, phone } = req.body || {};
  const digits = (x) => String(x || '').replace(/\D/g, '');
  const a = db.applicants.find((x) => x.name.trim().toLowerCase() === String(name || '').trim().toLowerCase() && x.birthDate === birthDate && digits(phone).length >= 7 && digits(x.guardian?.phone).endsWith(digits(phone).slice(-7)));
  if (!a) return fail(res, 404, 'APPLICANT_NOT_FOUND', 'Data tidak cocok. Pastikan nama lengkap, tanggal lahir, dan nomor HP wali sama persis dengan formulir.');
  ok(res, { regNo: a.regNo, name: a.name, birthDate: a.birthDate, status: a.status });
});
app.get('/api/public/admissions/status', (req, res) => {
  const { regNo, birthDate } = req.query;
  const a = db.applicants.find((x) => x.regNo === String(regNo || '').trim().toUpperCase() && x.birthDate === birthDate);
  if (!a) return fail(res, 404, 'APPLICANT_NOT_FOUND', 'Kombinasi nomor registrasi dan tanggal lahir tidak ditemukan.');
  ok(res, { regNo: a.regNo, name: a.name, status: a.status, majorPref: a.majorPref, rank: ['ACCEPTED', 'WAITING_LIST', 'RE_REGISTERED', 'ENROLLED'].includes(a.status) ? a.rank : null, decisionNote: a.decisionNote });
});
app.get('/api/public/info', (_req, res) => ok(res, { school: db.school, period: db.admissionPeriods.find((p) => p.status === 'OPEN') || null }));

const ADM_FLOW = { verify: ['SUBMITTED', 'VERIFIED', 'admission.verify'], accept: ['VERIFIED', 'ACCEPTED', 'admission.decide'], waitlist: ['VERIFIED', 'WAITING_LIST', 'admission.decide'], reject: ['VERIFIED', 'REJECTED', 'admission.decide'], reregister: ['ACCEPTED', 'RE_REGISTERED', 'admission.enroll'] };
app.post('/api/admissions/:id/transition', auth, (req, res) => {
  const a = db.applicants.find((x) => x.id === req.params.id);
  if (!a) return fail(res, 404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');
  const { action, documents, testScore, note } = req.body;
  if (action === 'update') {
    if (!can(req.user, 'admission.verify')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin.');
    if (documents) a.documents = documents;
    if (testScore !== undefined) a.testScore = testScore === '' ? null : Number(testScore);
    const scored = db.applicants.filter((x) => x.testScore != null && x.periodId === a.periodId).sort((x, y) => y.testScore - x.testScore);
    scored.forEach((x, i) => (x.rank = i + 1));
    save();
    return ok(res, a);
  }
  const flow = ADM_FLOW[action];
  if (!flow) return fail(res, 422, 'VALIDATION_ERROR', 'Aksi tidak dikenal.');
  const [from, to, perm] = flow;
  if (!can(req.user, perm)) return fail(res, 403, 'PERMISSION_DENIED', `Membutuhkan izin ${perm}.`);
  if (a.status !== from && !(action !== 'verify' && action !== 'reregister' && a.status === 'WAITING_LIST' && action === 'accept')) return fail(res, 409, 'ADMISSION_INVALID_TRANSITION', `Transisi ${a.status} → ${to} tidak diizinkan.`);
  if (action === 'verify' && a.documents.some((d) => d.status !== 'VALID')) return fail(res, 422, 'ADMISSION_DOCUMENTS_INCOMPLETE', 'Semua dokumen wajib berstatus VALID sebelum verifikasi.');
  if (action === 'reject' && !note) return fail(res, 422, 'REASON_REQUIRED', 'Alasan penolakan wajib diisi.');
  const before = { status: a.status };
  a.status = to; if (note) a.decisionNote = note;
  audit(req, `APPLICANT_${to}`, `applicants/${a.id}`, before, { status: to, note });
  save();
  ok(res, a);
});
app.post('/api/admissions/enroll-batch', auth, need('admission.enroll'), (req, res) => {
  const { applicantIds, classId } = req.body;
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls || cls.grade !== 10) return fail(res, 422, 'VALIDATION_ERROR', 'Pilih rombel Kelas 10 yang valid.');
  const apps = db.applicants.filter((a) => applicantIds.includes(a.id));
  const bad = apps.filter((a) => a.status !== 'RE_REGISTERED');
  if (bad.length) return fail(res, 409, 'ADMISSION_INVALID_TRANSITION', `${bad.length} pendaftar belum berstatus RE_REGISTERED.`);
  const room = db.rooms.find((r) => r.id === cls.roomId);
  const current = db.students.filter((s) => s.classId === cls.id).length;
  if (room && current + apps.length > room.capacity) return fail(res, 409, 'CLASSROOM_CAPACITY_EXCEEDED', `Kapasitas ${cls.name} (${room.capacity}) akan terlampaui.`);
  // Atomic: all-or-nothing
  const created = apps.map((a) => {
    const n = db.students.length + 1;
    const gId = 'grd_' + crypto.randomBytes(3).toString('hex');
    const s = {
      id: 'stu_' + crypto.randomBytes(3).toString('hex'), studentNo: `NOS-2027-${pad(n)}`, nationalNo: `EMIS-TL-PENDING`, name: a.name, gender: a.gender, birthDate: a.birthDate, birthPlace: a.birthPlace,
      address: a.address, classId: cls.id, grade: 10, major: cls.major, status: 'ACTIVE', scholarship: null, guardianId: gId, entryYear: 2027, religion: 'Katóliku',
      enrollments: [{ year: '2027', grade: 10, major: cls.major, className: cls.name, status: 'ACTIVE', source: 'ADMISSION' }], transfers: [], fromApplicant: a.regNo,
    };
    db.guardians.push({ id: gId, name: a.guardian.name, relation: a.guardian.relation, phone: a.guardian.phone, occupation: a.guardian.occupation, studentIds: [s.id] });
    a.status = 'ENROLLED'; a.studentId = s.id;
    return s;
  });
  db.students.push(...created);
  audit(req, 'APPLICANTS_ENROLLED', `classes/${cls.id}`, null, { count: created.length, regNos: apps.map((a) => a.regNo) });
  save();
  ok(res, { count: created.length });
});

// ---------- Students ----------
app.post('/api/students/:id/transfer', auth, need('student.change_status'), (req, res) => {
  const s = db.students.find((x) => x.id === req.params.id);
  if (!s) return fail(res, 404, 'NOT_FOUND', 'Siswa tidak ditemukan.');
  const { type, toClassId, effectiveDate, reason, document } = req.body;
  if (!reason || !effectiveDate) return fail(res, 422, 'REASON_REQUIRED', 'Tanggal efektif dan alasan mutasi wajib diisi.');
  const from = db.classes.find((c) => c.id === s.classId);
  if (type === 'OUT') {
    s.status = 'TRANSFERRED';
    s.enrollments.find((e) => e.status === 'ACTIVE') && (s.enrollments.find((e) => e.status === 'ACTIVE').status = 'TRANSFERRED_OUT');
  } else {
    const to = db.classes.find((c) => c.id === toClassId);
    if (!to) return fail(res, 422, 'VALIDATION_ERROR', 'Rombel tujuan wajib dipilih.');
    if (to.grade !== s.grade) return fail(res, 422, 'TRANSFER_GRADE_MISMATCH', 'Mutasi internal hanya untuk tingkat yang sama.');
    if (type === 'INTERNAL_CLASS' && to.major !== s.major) return fail(res, 422, 'TRANSFER_TYPE_MISMATCH', 'Gunakan tipe INTERNAL_MAJOR untuk pindah jurusan.');
    const active = s.enrollments.find((e) => e.status === 'ACTIVE');
    if (active) active.status = 'TRANSFERRED';
    s.enrollments.push({ year: '2026', grade: to.grade, major: to.major, className: to.name, status: 'ACTIVE', source: type === 'INTERNAL_MAJOR' ? 'MAJOR_TRANSFER' : 'CLASS_TRANSFER', from: effectiveDate });
    s.classId = to.id; s.major = to.major;
  }
  s.transfers.push({ type, fromClass: from?.name, toClass: db.classes.find((c) => c.id === toClassId)?.name || 'Sai husi eskola', effectiveDate, reason, document: document || null, approvedBy: req.user.name, at: nowIso() });
  audit(req, 'STUDENT_TRANSFERRED', `students/${s.id}`, { classId: from?.id }, { type, toClassId, reason });
  save();
  ok(res, s);
});
app.post('/api/students', auth, need('student.create'), (req, res) => {
  const b = req.body;
  const cls = db.classes.find((c) => c.id === b.classId);
  if (!b.name || !cls) return fail(res, 422, 'VALIDATION_ERROR', 'Nama dan rombel wajib diisi.');
  const gId = 'grd_' + crypto.randomBytes(3).toString('hex');
  const s = {
    id: 'stu_' + crypto.randomBytes(3).toString('hex'), studentNo: `NOS-2026-${pad(db.students.length + 1)}`, nationalNo: b.nationalNo || 'EMIS-TL-PENDING', name: b.name, gender: b.gender || 'F', birthDate: b.birthDate || '', birthPlace: b.birthPlace || '',
    address: b.address || '', classId: cls.id, grade: cls.grade, major: cls.major, status: 'ACTIVE', scholarship: b.scholarship || null, guardianId: gId, entryYear: 2026, religion: 'Katóliku',
    enrollments: [{ year: '2026', grade: cls.grade, major: cls.major, className: cls.name, status: 'ACTIVE', source: 'MANUAL' }], transfers: [],
  };
  db.guardians.push({ id: gId, name: b.guardianName || '-', relation: 'GUARDIAN', phone: b.guardianPhone || '', occupation: '', studentIds: [s.id] });
  db.students.push(s);
  audit(req, 'STUDENT_CREATED', `students/${s.id}`, null, { name: s.name, classId: cls.id });
  save();
  ok(res, s, 201);
});
app.post('/api/import/:kind', auth, need('system.import'), (req, res) => {
  const { kind } = req.params;
  const { rows, confirm, fileName, fileId } = req.body;
  const errors = [];
  const valid = [];
  (rows || []).forEach((r, i) => {
    const rowNo = i + 2;
    if (kind === 'STUDENTS') {
      if (!r.name) errors.push({ row: rowNo, field: 'name', code: 'REQUIRED', message: 'Nama wajib diisi.' });
      else if (!db.classes.find((c) => c.name === r.className)) errors.push({ row: rowNo, field: 'className', code: 'CLASSROOM_NOT_FOUND', message: `Rombel "${r.className}" tidak ditemukan.` });
      else valid.push(r);
    } else if (kind === 'LIBRARY_BOOKS') {
      if (!r.title || !r.isbn) errors.push({ row: rowNo, field: !r.title ? 'title' : 'isbn', code: 'REQUIRED', message: 'Judul dan ISBN wajib.' });
      else valid.push(r);
    } else if (kind === 'TEACHERS') {
      if (!r.name) errors.push({ row: rowNo, field: 'name', code: 'REQUIRED', message: 'Nama wajib diisi.' });
      else valid.push(r);
    }
  });
  if (!confirm) return ok(res, { total: rows.length, valid: valid.length, invalid: errors.length, errors });
  valid.forEach((r) => {
    if (kind === 'STUDENTS') {
      const cls = db.classes.find((c) => c.name === r.className);
      db.students.push({ id: 'stu_' + crypto.randomBytes(3).toString('hex'), studentNo: `NOS-2026-${pad(db.students.length + 1)}`, nationalNo: r.nationalNo || 'EMIS-TL-PENDING', name: r.name, gender: r.gender || 'F', birthDate: r.birthDate || '', birthPlace: r.birthPlace || '', address: '', classId: cls.id, grade: cls.grade, major: cls.major, status: 'ACTIVE', scholarship: null, guardianId: null, entryYear: 2026, enrollments: [{ year: '2026', grade: cls.grade, major: cls.major, className: cls.name, status: 'ACTIVE', source: 'IMPORT' }], transfers: [] });
    } else if (kind === 'LIBRARY_BOOKS') db.libraryBooks.push({ id: 'bk_' + crypto.randomBytes(3).toString('hex'), isbn: r.isbn, title: r.title, author: r.author || '', category: r.category || 'Jerál', year: Number(r.year) || null });
    else if (kind === 'TEACHERS') db.teachers.push({ id: 'tch_' + crypto.randomBytes(3).toString('hex'), employeeNo: `EMP-NOS-${pad(db.teachers.length + 1, 3)}`, name: r.name, gender: r.gender || 'M', category: r.category || 'KONTRATADU', specialization: r.specialization || '', subjectIds: [], hoursPerWeek: 0, status: 'ACTIVE', phone: r.phone || '', email: '', portalStatus: 'NONE' });
  });
  const report = [['Baris', 'Kolom', 'Kode Error', 'Pesan'], ...errors.map((e) => [e.row, e.field, e.code, e.message])];
  const resultFile = store.putFile({ id: 'f_' + crypto.randomBytes(8).toString('hex'), name: `hasil_import_${kind}.csv`, mime: 'text/csv; charset=utf-8', data: Buffer.from('﻿' + report.map((r) => r.join(',')).join('\n')), category: 'import-result', owner: req.user.username });
  const job = { id: 'job_' + nextCounter('job'), kind: 'IMPORT', code: `IMP-${kind}`, name: `Import ${kind} — ${fileName || 'file'}`, format: 'CSV', status: 'SUCCEEDED', progress: 100, createdAt: nowIso(), finishedAt: nowIso(), by: req.user.username, result: { imported: valid.length, skipped: errors.length }, sourceFileId: fileId || null, fileId: resultFile.id };
  db.reportJobs.unshift(job);
  audit(req, 'IMPORT_EXECUTED', `import/${kind}`, null, job.result);
  save();
  ok(res, job);
});
// Async report jobs: queued, processed in the background, output stored in SQLite `files`.
const REPORT_PERM = { ADM: 'admission.view', STU: 'student.view', ATT: 'attendance.view', GRD: 'assessment.view', RPT: 'report.view', FIN: 'finance.view', LIB: 'library.view', AST: 'asset.view', EXT: 'extracurricular.view' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function runReportJob(job) {
  const step = (progress, status = 'RUNNING') => { Object.assign(job, { progress, status }); save(); };
  try {
    step(5);
    await wait(400); step(20);
    const rows = buildRows(job.code, db, job.params || {});
    await wait(500); step(55);
    const cls = db.classes.find((c) => c.id === job.params?.classId)?.name;
    const subtitle = `${cls || 'Semua rombel'}${job.params?.trimester ? ` · Trimestre ${job.params.trimester}` : ''} · Tahun Ajaran 2026 · dibuat ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    const out = await render(job.format, rows, `${job.code} ${REPORTS[job.code]}`, subtitle);
    await wait(400); step(90);
    const f = store.putFile({ id: 'f_' + crypto.randomBytes(8).toString('hex'), name: `${job.code}_${REPORTS[job.code].replace(/\W+/g, '_')}.${out.ext}`, mime: out.mime, data: out.data, category: 'report', owner: job.by });
    Object.assign(job, { fileId: f.id, rows: rows.length - 1, finishedAt: nowIso(), error: null });
    step(100, 'SUCCEEDED');
  } catch (e) {
    Object.assign(job, { error: e.message, finishedAt: nowIso() });
    step(100, 'FAILED');
  }
}
app.post('/api/jobs', auth, (req, res) => {
  const { code, format = 'XLSX', params = {} } = req.body;
  if (!REPORTS[code]) return fail(res, 422, 'VALIDATION_ERROR', 'Kode laporan tidak dikenal.');
  if (!['XLSX', 'CSV', 'PDF'].includes(format)) return fail(res, 422, 'VALIDATION_ERROR', 'Format harus PDF, XLSX, atau CSV.');
  if (!can(req.user, REPORT_PERM[code.split('-')[0]])) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin untuk laporan ini.');
  const job = { id: 'job_' + nextCounter('job'), kind: 'REPORT', code, name: REPORTS[code], format, params, status: 'QUEUED', progress: 0, createdAt: nowIso(), by: req.user.username, fileId: null };
  db.reportJobs.unshift(job);
  audit(req, 'REPORT_REQUESTED', `reportJobs/${job.id}`, null, { code, format, params });
  save();
  setImmediate(() => runReportJob(job));
  ok(res, job, 201);
});
app.post('/api/jobs/:id/retry', auth, (req, res) => {
  const job = db.reportJobs.find((j) => j.id === req.params.id);
  if (!job || job.kind !== 'REPORT' || !REPORTS[job.code]) return fail(res, 404, 'NOT_FOUND', 'Job laporan tidak ditemukan.');
  Object.assign(job, { status: 'QUEUED', progress: 0, error: null, fileId: null });
  save();
  setImmediate(() => runReportJob(job));
  ok(res, job);
});
// Download a job result; seeded report jobs without a stored file are rendered on demand.
app.get('/api/jobs/:id/download', auth, async (req, res) => {
  const job = db.reportJobs.find((j) => j.id === req.params.id);
  if (!job) return fail(res, 404, 'NOT_FOUND', 'Job tidak ditemukan.');
  if (!job.fileId && job.kind === 'REPORT' && REPORTS[job.code]) await runReportJob(job);
  if (!job.fileId) return fail(res, 404, 'NOT_FOUND', 'Hasil job tidak tersedia.');
  sendFile(req, res, job.fileId, true);
});

// ---------- Files (stored as BLOBs in SQLite) ----------
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/csv|application\/vnd\.(openxmlformats-officedocument\.spreadsheetml\.sheet|ms-excel)|application\/octet-stream)$/;
function acceptUpload(req, res, { maxMb, category, mimeRe = ALLOWED_MIME, owner }) {
  const { name, mime, dataBase64 } = req.body || {};
  if (!name || !dataBase64) return fail(res, 422, 'VALIDATION_ERROR', 'File wajib diisi.');
  const type = mime || 'application/octet-stream';
  if (!mimeRe.test(type)) return fail(res, 422, 'FILE_TYPE_NOT_ALLOWED', `Tipe file ${type} tidak diizinkan.`);
  const data = Buffer.from(dataBase64, 'base64');
  if (data.length > maxMb * 1024 * 1024) return fail(res, 422, 'FILE_TOO_LARGE', `Ukuran file maksimal ${maxMb} MB.`);
  const f = store.putFile({ id: 'f_' + crypto.randomBytes(8).toString('hex'), name: String(name).slice(0, 200), mime: type, data, category, owner });
  ok(res, f, 201);
}
function readableFile(req, res, id) {
  const f = store.getFile(id);
  if (!f) return fail(res, 404, 'NOT_FOUND', 'File tidak ditemukan.'), null;
  const selfPortal = req.user.roles.every((r) => r === 'STUDENT' || r === 'GUARDIAN');
  if (selfPortal && f.owner !== req.user.username) return fail(res, 403, 'OBJECT_SCOPE_DENIED', 'Tidak berhak membuka file ini.'), null;
  if (f.category === 'admission' && !can(req.user, 'admission.view')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak berhak membuka dokumen pendaftar.'), null;
  if (f.category === 'bank-receipt' && !can(req.user, 'finance.view')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak berhak membuka kuitansi bank.'), null;
  return f;
}
function sendFile(req, res, id, download) {
  const f = readableFile(req, res, id);
  if (!f) return;
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(Buffer.from(f.data));
}
const UPLOAD_CATEGORIES = new Set(['bank-receipt', 'pauta', 'import', 'transfer-letter', 'leave', 'announcement', 'general']);
app.post('/api/files', auth, (req, res) => acceptUpload(req, res, { maxMb: 15, category: UPLOAD_CATEGORIES.has(req.body?.category) ? req.body.category : 'general', owner: req.user.username }));
// Public upload for PPDB applicant documents only (PDF/JPG/PNG, max 5 MB).
app.post('/api/public/files', (req, res) => acceptUpload(req, res, { maxMb: 5, category: 'admission', owner: 'public', mimeRe: /^(image\/(png|jpe?g)|application\/pdf)$/ }));
app.get('/api/files/:id', auth, (req, res) => sendFile(req, res, req.params.id, !!req.query.download));
// In-app preview: bytes wrapped in JSON so download managers (e.g. IDM) that hijack
// application/pdf responses cannot turn the preview into a download.
app.get('/api/files/:id/preview', auth, (req, res) => {
  const f = readableFile(req, res, req.params.id);
  if (!f) return;
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, { name: f.name, mime: f.mime, base64: Buffer.from(f.data).toString('base64') });
});

// ---------- Report cards / promotion ----------
app.post('/api/report-cards/:action', auth, (req, res) => {
  const { action } = req.params;
  const { ids, classId, trimester, note, reason } = req.body;
  if (action === 'note') {
    if (!can(req.user, 'report.generate')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin.');
    const rc = db.reportCards.find((r) => r.id === ids[0]);
    if (rc.status === 'PUBLISHED') return fail(res, 409, 'REPORT_CARD_LOCKED', 'Rapor sudah terbit. Buka kembali dahulu.');
    rc.homeroomNote = note; save(); return ok(res, rc);
  }
  if (action === 'publish') {
    if (!can(req.user, 'report.publish')) return fail(res, 403, 'PERMISSION_DENIED', 'Hanya Diretora / Vise-Diretora yang dapat menerbitkan rapor.');
    const subs = db.teachingAssignments.filter((a) => a.classId === classId);
    const notFinal = subs.filter((a) => db.termGrades.find((t) => t.classId === classId && t.subjectId === a.subjectId && t.trimester === Number(trimester))?.status !== 'FINALIZED');
    if (notFinal.length) return fail(res, 409, 'REPORT_NOT_READY', `${notFinal.length} mata pelajaran belum FINALIZED.`);
    const stuIds = db.students.filter((s) => s.classId === classId).map((s) => s.id);
    let n = 0;
    db.reportCards.filter((r) => stuIds.includes(r.studentId) && r.trimester === Number(trimester) && r.status !== 'PUBLISHED').forEach((r) => { r.status = 'PUBLISHED'; r.revision += 1; r.publishedAt = nowIso(); n++; });
    stuIds.forEach((sid) => { const s = db.students.find((x) => x.id === sid); notify(`GUARDIAN:${s.guardianId}`, 'report_card.published', `Rapor Trimestre ${trimester} terbit`, s.name, '/guardian/home'); });
    audit(req, 'REPORT_CARDS_PUBLISHED', `classes/${classId}`, null, { trimester, count: n });
    save(); return ok(res, { count: n });
  }
  if (action === 'review') {
    if (!can(req.user, 'report.generate')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin.');
    db.reportCards.filter((r) => ids.includes(r.id) && r.status === 'DRAFT').forEach((r) => (r.status = 'REVIEWED'));
    save(); return ok(res, true);
  }
  if (action === 'reopen') {
    if (!can(req.user, 'report.reopen')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin.');
    if (!reason) return fail(res, 422, 'REASON_REQUIRED', 'Alasan wajib diisi.');
    db.reportCards.filter((r) => ids.includes(r.id)).forEach((r) => { r.status = 'REOPENED'; r.reopenReason = reason; });
    audit(req, 'REPORT_CARD_REOPENED', `reportCards/${ids.join(',')}`, null, { reason });
    save(); return ok(res, true);
  }
  fail(res, 404, 'NOT_FOUND', 'Aksi tidak dikenal.');
});
app.post('/api/promotions', auth, need('report.publish'), (req, res) => {
  const { decisions } = req.body; // [{studentId, decision, reason, toMajor}]
  for (const d of decisions) {
    if (d.decision === 'REPEATED' && !d.reason) return fail(res, 422, 'REASON_REQUIRED', 'Keputusan REPEATED wajib disertai alasan.');
    const s = db.students.find((x) => x.id === d.studentId);
    if (d.decision === 'GRADUATED' && s.grade !== 12) return fail(res, 422, 'PROMOTION_INVALID', 'GRADUATED hanya untuk Kelas XII.');
    if (d.toMajor && d.toMajor !== s.major && !d.reason) return fail(res, 422, 'REASON_REQUIRED', 'Pindah jurusan wajib disertai alasan.');
  }
  decisions.forEach((d) => {
    const i = db.promotions.findIndex((p) => p.studentId === d.studentId);
    const rec = { ...d, decidedBy: req.user.name, at: nowIso() };
    if (i >= 0) db.promotions[i] = rec; else db.promotions.push(rec);
  });
  audit(req, 'PROMOTION_DECIDED', 'promotions', null, { count: decisions.length });
  save();
  ok(res, true);
});

// ---------- Library ----------
app.post('/api/library/:action', auth, (req, res) => {
  const { action } = req.params;
  const { barcode, borrowerType, borrowerId, dueAt, condition, fine } = req.body;
  if (!can(req.user, action === 'checkout' ? 'library.issue' : 'library.return')) return fail(res, 403, 'PERMISSION_DENIED', 'Tidak memiliki izin perpustakaan.');
  const copy = db.libraryCopies.find((c) => c.barcode === String(barcode || '').trim().toUpperCase());
  if (!copy) return fail(res, 404, 'LIBRARY_COPY_NOT_FOUND', `Barcode ${barcode} tidak ditemukan.`);
  if (action === 'checkout') {
    if (copy.status !== 'AVAILABLE') return fail(res, 409, 'LIBRARY_COPY_UNAVAILABLE', `Salinan berstatus ${copy.status}.`);
    if (!borrowerId) return fail(res, 422, 'VALIDATION_ERROR', 'Peminjam wajib dipilih.');
    const overdue = db.loans.filter((l) => l.borrowerId === borrowerId && l.status === 'OVERDUE');
    if (overdue.length) return fail(res, 409, 'LIBRARY_BORROWER_HAS_OVERDUE', 'Peminjam masih memiliki pinjaman terlambat.');
    const ln = { id: 'ln_' + crypto.randomBytes(3).toString('hex'), copyId: copy.id, borrowerType, borrowerId, borrowedAt: nowIso().slice(0, 10), dueAt, returnedAt: null, fine: 0, condition: null, status: 'OPEN', renewals: 0 };
    db.loans.unshift(ln); copy.status = 'ON_LOAN';
    audit(req, 'LIBRARY_CHECKOUT', `loans/${ln.id}`, null, { barcode: copy.barcode, borrowerId });
    save(); return ok(res, ln, 201);
  }
  const ln = db.loans.find((l) => l.copyId === copy.id && ['OPEN', 'OVERDUE'].includes(l.status));
  if (!ln) return fail(res, 404, 'LIBRARY_LOAN_NOT_FOUND', 'Tidak ada pinjaman terbuka untuk barcode ini.');
  if (action === 'return') {
    ln.status = 'RETURNED'; ln.returnedAt = nowIso().slice(0, 10); ln.condition = condition || 'GOOD'; ln.fine = Number(fine) || 0;
    copy.status = condition === 'LOST' ? 'LOST' : condition === 'DAMAGED' ? 'REPAIR' : 'AVAILABLE';
    if (condition === 'LOST') ln.status = 'LOST';
  } else if (action === 'renew') {
    if (ln.status === 'OVERDUE') return fail(res, 409, 'LIBRARY_RENEW_OVERDUE', 'Pinjaman terlambat tidak dapat diperpanjang.');
    if (ln.renewals >= 2) return fail(res, 409, 'LIBRARY_RENEW_LIMIT', 'Batas perpanjangan (2x) tercapai.');
    const d = new Date(ln.dueAt); d.setDate(d.getDate() + 14); ln.dueAt = d.toISOString().slice(0, 10); ln.renewals += 1;
  } else return fail(res, 404, 'NOT_FOUND', 'Aksi tidak dikenal.');
  audit(req, `LIBRARY_${action.toUpperCase()}`, `loans/${ln.id}`, null, { barcode: copy.barcode, condition });
  save();
  ok(res, ln);
});

// ---------- Assets ----------
app.post('/api/assets/:id/:action', auth, need('asset.manage'), (req, res) => {
  const a = db.assets.find((x) => x.id === req.params.id);
  if (!a) return fail(res, 404, 'NOT_FOUND', 'Aset tidak ditemukan.');
  const { action } = req.params;
  const { assignee, roomId, note, condition } = req.body;
  if (a.status === 'RETIRED') return fail(res, 409, 'ASSET_RETIRED', 'Aset sudah dipensiunkan.');
  const before = { status: a.status, assignee: a.assignee };
  if (action === 'assign') { a.assignee = assignee || null; if (roomId !== undefined) a.roomId = roomId; a.status = assignee ? 'ASSIGNED' : 'AVAILABLE'; a.history.unshift({ at: nowIso().slice(0, 10), type: 'ASSIGNED', note: `Serah terima ke ${assignee || 'gudang'}${note ? ' — ' + note : ''}` }); }
  else if (action === 'maintenance') { a.status = 'MAINTENANCE'; if (condition) a.condition = condition; a.history.unshift({ at: nowIso().slice(0, 10), type: 'MAINTENANCE', note: note || 'Pemeliharaan' }); }
  else if (action === 'complete') { a.status = a.assignee ? 'ASSIGNED' : 'AVAILABLE'; a.condition = condition || 'GOOD'; a.history.unshift({ at: nowIso().slice(0, 10), type: 'REPAIRED', note: note || 'Selesai diperbaiki' }); }
  else if (action === 'retire') { if (!note) return fail(res, 422, 'REASON_REQUIRED', 'Alasan wajib diisi.'); a.status = 'RETIRED'; a.assignee = null; a.history.unshift({ at: nowIso().slice(0, 10), type: 'RETIRED', note }); }
  else return fail(res, 404, 'NOT_FOUND', 'Aksi tidak dikenal.');
  audit(req, `ASSET_${action.toUpperCase()}`, `assets/${a.id}`, before, { status: a.status, assignee: a.assignee });
  save();
  ok(res, a);
});

// ---------- Counseling ----------
app.get('/api/counseling/:id', auth, need('counseling.view'), (req, res) => {
  const c = db.counselingCases.find((x) => x.id === req.params.id);
  if (!c) return fail(res, 404, 'NOT_FOUND', 'Kasus tidak ditemukan.');
  audit(req, 'COUNSELING_CASE_ACCESSED', `counselingCases/${c.id}`, null, null);
  save();
  ok(res, c);
});
app.post('/api/counseling/:id/followup', auth, need('counseling.manage'), (req, res) => {
  const c = db.counselingCases.find((x) => x.id === req.params.id);
  if (!c) return fail(res, 404, 'NOT_FOUND', 'Kasus tidak ditemukan.');
  if (!req.body.note) return fail(res, 422, 'VALIDATION_ERROR', 'Catatan wajib diisi.');
  c.followUps.push({ at: nowIso(), by: req.user.name, note: req.body.note, kind: req.body.kind || 'NOTE' }); // append-only
  if (req.body.status) c.status = req.body.status;
  audit(req, 'COUNSELING_FOLLOWUP_ADDED', `counselingCases/${c.id}`, null, { kind: req.body.kind });
  save();
  ok(res, c);
});

app.post('/api/reset-demo', auth, need('*'), (req, res) => {
  store.reset(buildSeed());
  db = store.load();
  sessions.clear();
  save();
  ok(res, true);
});

// ---------- Static (production build) ----------
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));

app.listen(PORT, () => console.log(`[api] SIMS NOSSEF API listening on http://localhost:${PORT}`));
