// Deterministic seed data for SIMS NOSSEF Railaco.
// Run `node server/seed.js --force` to regenerate server/data/db.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let seed = 20260815;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n, w = 4) => String(n).padStart(w, '0');
const id = (p, n) => `${p}_${pad(n, 4)}`;

export function hashPassword(pw, salt = crypto.randomBytes(8).toString('hex')) {
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

// Grading scale 0–10 (Timor-Leste ESG, school rule): Média = TPC 20% + Teste 1 25% + Teste 2 25% + Ezame 30%.
// Situation: REPROVADO for 0.00–5.00, APROVADO above 5.00.
export const SCALE_MAX = 10;
export const PASS_ABOVE = 5;
export function computeFinal(s) {
  const vals = [s.tpc, s.t1, s.t2, s.ezame];
  if (vals.some((v) => v === null || v === undefined || v === '')) return null;
  return round2(s.tpc * 0.2 + s.t1 * 0.25 + s.t2 * 0.25 + s.ezame * 0.3);
}
export function situation(final) {
  if (final == null) return null;
  return final > PASS_ABOVE ? 'APROVADO' : 'REPROVADO';
}

const FIRST_M = ['João', 'António', 'Manuel', 'Francisco', 'José', 'Domingos', 'Mateus', 'Agostinho', 'Paulo', 'Aleixo', 'Celestino', 'Hermenegildo', 'Lourenço', 'Marcelino', 'Natalino', 'Oscar', 'Remígio', 'Silvino', 'Tomás', 'Venâncio', 'Zeferino', 'Abílio', 'Bernardino', 'Cipriano', 'Delfim', 'Eusébio', 'Fernando', 'Gaspar', 'Inácio', 'Jacinto'];
const FIRST_F = ['Maria', 'Ana', 'Joana', 'Teresa', 'Rosa', 'Fátima', 'Lúcia', 'Natália', 'Sabina', 'Filomena', 'Graciana', 'Helena', 'Imaculada', 'Juliana', 'Leopoldina', 'Madalena', 'Olinda', 'Perpétua', 'Regina', 'Santina', 'Vitória', 'Zulmira', 'Albertina', 'Bendita', 'Carolina', 'Delfina', 'Ermelinda', 'Floriana', 'Germana', 'Isabel'];
const LAST = ['da Costa', 'Soares', 'Pereira', 'Martins', 'Guterres', 'Ximenes', 'Belo', 'Gusmão', 'Amaral', 'dos Santos', 'Freitas', 'Lopes', 'Mendonça', 'Sarmento', 'Araújo', 'Fernandes', 'Carvalho', 'Pinto', 'Tilman', 'Lobato', 'Alves', 'Barreto', 'de Jesus', 'Gomes', 'Hornai', 'Mau', 'Leki', 'Siqueira', 'Correia', 'do Rosário'];
const PLACES = ['Railaco', 'Ermera', 'Gleno', 'Hatulia', 'Letefoho', 'Atsabe', 'Dili', 'Liquiçá', 'Aileu', 'Maubara'];
const SUCOS = ['Railaco Leten', 'Railaco Kraik', 'Tokoluli', 'Samalete', 'Matata', 'Lihu', 'Deleco', 'Taraco'];
const JOBS = ['Agrikultor', 'Komersiante', 'Funsionáriu Públiku', 'Profesór', 'Enfermeiru', 'Kafé-Produtór', 'Motorista', 'Doméstika'];
const PRESEC = ['EBF Railaco', 'EBF Tokoluli', 'EBC Ermera', 'EBF Samalete', 'EBC Gleno', 'EBF Hatulia', 'EBC Letefoho'];

export function buildSeed() {
  const today = '2026-10-15';
  const db = {};
  db.school = {
    name: 'Escola Secundária Católica Nossa Senhora de Fátima',
    short: 'NOSSEF Railaco',
    address: 'Suco Railaco Leten, Posto Administrativo Railaco, Município Ermera, Timor-Leste',
    phone: '+670 7723 4410',
    email: 'secretaria@nossef-railaco.tl',
    timezone: 'Asia/Dili',
    currency: 'USD',
    defaultLang: 'tet',
    founded: 2002,
    activeYear: '2026',
    activeTrimester: 3,
  };
  db.academicYears = [
    { id: 'ay_2025', name: '2025', start: '2025-01-20', end: '2025-12-05', status: 'CLOSED' },
    { id: 'ay_2026', name: '2026', start: '2026-01-19', end: '2026-12-04', status: 'ACTIVE' },
    { id: 'ay_2027', name: '2027', start: '2027-01-18', end: '2027-12-03', status: 'DRAFT' },
  ];
  db.trimesters = [
    { id: 'tri_1', yearId: 'ay_2026', number: 1, cau: 1, start: '2026-01-19', end: '2026-04-10', gradeWindowStart: '2026-04-01', gradeWindowEnd: '2026-04-17', status: 'CLOSED' },
    { id: 'tri_2', yearId: 'ay_2026', number: 2, cau: 2, start: '2026-04-27', end: '2026-08-07', gradeWindowStart: '2026-07-29', gradeWindowEnd: '2026-08-14', status: 'CLOSED' },
    { id: 'tri_3', yearId: 'ay_2026', number: 3, cau: 3, start: '2026-08-24', end: '2026-12-04', gradeWindowStart: '2026-11-20', gradeWindowEnd: '2026-12-08', status: 'ACTIVE' },
  ];
  db.majors = [
    { id: 'CT', code: 'CT', name: 'Ciências e Tecnologias', alias: 'IPA' },
    { id: 'CSH', code: 'CSH', name: 'Ciências Sociais e Humanidades', alias: 'IPS' },
  ];
  db.rooms = Array.from({ length: 12 }, (_, i) => ({
    id: id('room', i + 1),
    code: i < 9 ? `R-${101 + i}` : ['LAB-FIS', 'LAB-KIM', 'LAB-INF'][i - 9],
    name: i < 9 ? `Sala ${101 + i}` : ['Laboratóriu Fízika', 'Laboratóriu Kímika', 'Laboratóriu Informátika'][i - 9],
    capacity: i < 9 ? 36 : 30,
  }));
  db.bellPeriods = [
    ['07:30', '08:15'], ['08:15', '09:00'], ['09:00', '09:45'], ['10:05', '10:50'], ['10:50', '11:35'], ['11:35', '12:20'], ['12:20', '13:05'], ['13:05', '13:50'],
  ].map(([s, e], i) => ({ id: `bp_${i + 1}`, order: i + 1, start: s, end: e }));

  const subjectsDef = [
    ['TET', 'Tétum', ['CT', 'CSH'], 3], ['POR', 'Português', ['CT', 'CSH'], 4], ['ING', 'Inglês', ['CT', 'CSH'], 3], ['IND', 'Bahasa Indonesia', ['CT', 'CSH'], 2],
    ['MAT', 'Matemática', ['CT', 'CSH'], 5], ['REL', 'Religião e Moral', ['CT', 'CSH'], 2], ['CID', 'Cidadania e Desenvolvimento Social', ['CT', 'CSH'], 2], ['EDF', 'Educação Física e Desporto', ['CT', 'CSH'], 2],
    ['FIS', 'Física', ['CT'], 4], ['QUI', 'Química', ['CT'], 4], ['BIO', 'Biologia', ['CT'], 4], ['GEO', 'Geologia', ['CT'], 2], ['TIC', 'Tecnologias de Informação e Comunicação', ['CT', 'CSH'], 2],
    ['HIS', 'História', ['CSH'], 4], ['GEG', 'Geografia', ['CSH'], 4], ['ECO', 'Economia', ['CSH'], 4], ['SOC', 'Sociologia', ['CSH'], 3],
  ];
  db.subjects = subjectsDef.map(([code, name, majors, weekly], i) => ({ id: `sub_${code}`, code, name, majors, weeklyPeriods: weekly, credit: weekly }));

  // Teachers
  const teacherDef = [
    ['Prof. Dra. Cristina Amaral', 'F', 'FUNCIONARIO', 'Gestão Educacional', ['REL']],
    ['Ir. Maria Gorete Martins', 'F', 'FUNCIONARIO', 'Pedagogia e Currículo', ['POR']],
    ['Prof. António da Costa Soares', 'M', 'FUNCIONARIO', 'Licenciatura em Física', ['FIS', 'MAT']],
    ['Prof. Domingos Ximenes', 'M', 'FUNCIONARIO', 'Licenciatura em Matemática', ['MAT']],
    ['Prof.ª Lúcia Guterres', 'F', 'KONTRATADU', 'Licenciatura em Biologia', ['BIO', 'GEO']],
    ['Prof. Mateus Pereira', 'M', 'FUNCIONARIO', 'Licenciatura em Química', ['QUI']],
    ['Prof.ª Teresa Belo', 'F', 'KONTRATADU', 'Licenciatura em Língua Portuguesa', ['POR']],
    ['Prof. Agostinho Freitas', 'M', 'KONTRATADU', 'Licenciatura em Inglês', ['ING']],
    ['Prof.ª Rosa Mendonça', 'F', 'FUNCIONARIO', 'Licenciatura em História', ['HIS', 'CID']],
    ['Prof. Paulo Sarmento', 'M', 'KONTRATADU', 'Licenciatura em Geografia', ['GEG']],
    ['Prof.ª Natália Araújo', 'F', 'FUNCIONARIO', 'Licenciatura em Economia', ['ECO', 'SOC']],
    ['Prof. Celestino Lopes', 'M', 'PART_TIME', 'Licenciatura em Desporto', ['EDF']],
    ['Prof.ª Filomena Gusmão', 'F', 'KONTRATADU', 'Licenciatura em Tétum', ['TET']],
    ['Prof. Manuel Fernandes', 'M', 'PART_TIME', 'Licenciatura em Informática', ['TIC']],
    ['Prof.ª Helena dos Santos', 'F', 'KONTRATADU', 'Licenciatura em Pendidikan Bahasa Indonesia', ['IND']],
    ['Pe. José Carvalho, SJ', 'M', 'PART_TIME', 'Teologia', ['REL']],
    ['Prof. Venâncio Tilman', 'M', 'FUNCIONARIO', 'Licenciatura em Matemática', ['MAT', 'TIC']],
    ['Prof.ª Graciana Lobato', 'F', 'KONTRATADU', 'Licenciatura em Sociologia', ['SOC', 'CID']],
    ['Prof. Bernardino Alves', 'M', 'FUNCIONARIO', 'Licenciatura em Física', ['FIS']],
    ['Prof.ª Madalena Barreto', 'F', 'KONTRATADU', 'Licenciatura em Inglês', ['ING', 'TET']],
  ];
  db.teachers = teacherDef.map(([name, gender, category, spec, subs], i) => ({
    id: id('tch', i + 1),
    employeeNo: category === 'FUNCIONARIO' ? `NIP-1980${pad(between(1000, 9999))}${pad(i + 1, 2)}` : `EMP-NOS-${pad(i + 1, 3)}`,
    name, gender, category, specialization: spec, subjectIds: subs.map((s) => `sub_${s}`),
    hoursPerWeek: 0,
    status: i === 15 ? 'LEAVE' : 'ACTIVE',
    phone: `+670 77${between(10, 99)} ${between(1000, 9999)}`,
    email: `${name.replace(/^(Prof\.ª|Prof\.|Ir\.|Pe\.|Dra\.)\s*/g, '').replace(/^(Dra\.)\s*/, '').split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${i + 1}@nossef-railaco.tl`,
    education: spec.startsWith('Licenciatura') ? 'S1 / Licenciatura — UNTL Díli' : 'Mestrado — Universidade Católica Portuguesa',
    joinedYear: between(2004, 2022),
    skNo: `SK/MEJD/${between(2008, 2024)}/${pad(between(100, 999), 3)}`,
    portalStatus: 'ACTIVE',
  }));

  db.staff = [
    ['Sra. Imaculada Hornai', 'Sekretaria da Escola'], ['Sr. Lourenço Correia', 'Tesoureiro / Finansas'], ['Sra. Albertina Leki', 'Bibliotekária'],
    ['Sr. Gaspar Siqueira', 'Ofisiál Patrimóniu & Logístika'], ['Sra. Perpétua do Rosário', 'Konselora BK'], ['Sr. Natalino Mau', 'Ofisiál Admisaun'],
    ['Sr. Aleixo Gomes', 'Guarda / Seguransa'], ['Sra. Zulmira de Jesus', 'Limpeza'],
  ].map(([name, position], i) => ({ id: id('stf', i + 1), employeeNo: `STF-NOS-${pad(i + 1, 3)}`, name, position, phone: `+670 77${between(10, 99)} ${between(1000, 9999)}`, status: 'ACTIVE' }));

  // Classes (9 rombel)
  const classDef = [
    ['10º CT-A', 10, 'CT', 'tch_0003', 'room_0001'], ['10º CT-B', 10, 'CT', 'tch_0019', 'room_0002'], ['10º CSH-A', 10, 'CSH', 'tch_0009', 'room_0003'],
    ['10º CSH-B', 10, 'CSH', 'tch_0013', 'room_0004'], ['11º CT-A', 11, 'CT', 'tch_0005', 'room_0005'], ['11º CT-B', 11, 'CT', 'tch_0006', 'room_0006'],
    ['11º CSH', 11, 'CSH', 'tch_0011', 'room_0007'], ['12º CT', 12, 'CT', 'tch_0004', 'room_0008'], ['12º CSH', 12, 'CSH', 'tch_0010', 'room_0009'],
  ];
  db.classes = classDef.map(([name, grade, major, hr, room], i) => ({ id: id('cls', i + 1), name, grade, major, homeroomTeacherId: hr, roomId: room, chefeStudentId: null, yearId: 'ay_2026' }));

  // Guardians + students
  db.guardians = [];
  db.students = [];
  let stuN = 0;
  const sizes = [26, 25, 24, 23, 25, 24, 23, 22, 21];
  db.classes.forEach((cls, ci) => {
    for (let k = 0; k < sizes[ci]; k++) {
      stuN++;
      const gender = rand() < 0.52 ? 'F' : 'M';
      const last = pick(LAST);
      const name = `${pick(gender === 'F' ? FIRST_F : FIRST_M)} ${rand() < 0.4 ? pick(gender === 'F' ? FIRST_F : FIRST_M) + ' ' : ''}${last}`;
      const birthYear = 2026 - (cls.grade + 6) - between(0, 1);
      const entryYear = 2026 - (cls.grade - 10);
      const gId = id('grd', stuN);
      const guardianName = `${pick(rand() < 0.5 ? FIRST_M : FIRST_F)} ${last}`;
      db.guardians.push({ id: gId, name: guardianName, relation: pick(['FATHER', 'MOTHER', 'GUARDIAN']), phone: `+670 77${between(10, 99)} ${between(1000, 9999)}`, occupation: pick(JOBS), studentIds: [] });
      const enrollments = [];
      for (let y = entryYear; y <= 2026; y++) {
        const g = 10 + (y - entryYear);
        const prefix = `${g}º ${cls.major}`;
        enrollments.push({ year: String(y), grade: g, major: cls.major, className: y === 2026 ? cls.name : `${prefix}${cls.major === 'CT' ? '-A' : ''}`, status: y === 2026 ? 'ACTIVE' : 'PROMOTED', source: y === entryYear ? 'ADMISSION' : 'PROMOTION' });
      }
      const r = rand();
      const s = {
        id: id('stu', stuN),
        studentNo: `NOS-${entryYear}-${pad(stuN, 4)}`,
        nationalNo: `EMIS-TL-${between(100000, 999999)}${pad(stuN, 3)}`,
        name, gender,
        birthDate: `${birthYear}-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`,
        birthPlace: pick(PLACES),
        address: `Aldeia ${pick(['Lebumeta', 'Hatuqueo', 'Riamori', 'Lisapat', 'Bunlelo', 'Fatubessi'])}, Suco ${pick(SUCOS)}`,
        classId: cls.id, grade: cls.grade, major: cls.major,
        status: rand() < 0.015 ? 'LISENSA' : 'ACTIVE',
        scholarship: r < 0.06 ? 'MERITO' : r < 0.1 ? 'JESUITA' : r < 0.16 ? 'SOSIAL' : null,
        guardianId: gId,
        entryYear,
        religion: 'Katóliku',
        enrollments,
        transfers: [],
      };
      db.guardians[db.guardians.length - 1].studentIds.push(s.id);
      db.students.push(s);
    }
  });
  // Sibling: guardian of stu_0001 also has a child in 12º CT (for guardian child switcher)
  const sib = db.students.find((s) => s.classId === 'cls_0008');
  const g1 = db.guardians.find((g) => g.id === db.students[0].guardianId);
  g1.name = 'Sr. Francisco da Costa'; g1.relation = 'FATHER';
  db.students[0].name = 'Maria Imaculada da Costa'; db.students[0].gender = 'F';
  sib.name = 'João Paulo da Costa'; sib.gender = 'M';
  db.guardians = db.guardians.filter((g) => g.id !== sib.guardianId);
  sib.guardianId = g1.id; g1.studentIds.push(sib.id);

  // Chefe de turma
  db.classes.forEach((c) => {
    const st = db.students.filter((s) => s.classId === c.id);
    c.chefeStudentId = st[between(0, st.length - 1)].id;
  });

  // Teaching assignments
  db.teachingAssignments = [];
  let taN = 0;
  const load = {};
  db.classes.forEach((c) => {
    db.subjects.filter((s) => s.majors.includes(c.major)).forEach((sub) => {
      const cands = db.teachers.filter((t) => t.subjectIds.includes(sub.id) && t.status === 'ACTIVE' && t.id !== 'tch_0001' && t.id !== 'tch_0002');
      const t = cands.sort((a, b) => (load[a.id] || 0) - (load[b.id] || 0))[0] || db.teachers[0];
      load[t.id] = (load[t.id] || 0) + sub.weeklyPeriods;
      db.teachingAssignments.push({ id: id('ta', ++taN), teacherId: t.id, classId: c.id, subjectId: sub.id, weeklyPeriods: sub.weeklyPeriods });
    });
  });
  // Ensure demo teacher António teaches Física in 10º CT-A
  const fisA = db.teachingAssignments.find((t) => t.classId === 'cls_0001' && t.subjectId === 'sub_FIS');
  if (fisA) fisA.teacherId = 'tch_0003';
  db.teachers.forEach((t) => {
    t.hoursPerWeek = db.teachingAssignments.filter((a) => a.teacherId === t.id).reduce((s, a) => s + a.weeklyPeriods, 0);
    if (t.id === 'tch_0001' || t.id === 'tch_0002') t.hoursPerWeek = 4;
  });

  // Schedule: fill 6 days x 8 periods respecting teacher/room conflicts (greedy)
  db.schedule = [];
  const busy = new Set();
  let schN = 0;
  db.classes.forEach((c, ci) => {
    const used = new Set();
    const subjectDays = new Set();
    // Spread each subject's weekly periods over different days (max 1 per day on the first pass).
    db.teachingAssignments.filter((a) => a.classId === c.id).forEach((a, ai) => {
      const sub = db.subjects.find((s) => s.id === a.subjectId);
      for (let k = 0; k < Math.min(a.weeklyPeriods, 4); k++) {
        const room = sub.code === 'FIS' && k % 2 ? 'room_0010' : sub.code === 'QUI' && k % 2 ? 'room_0011' : sub.code === 'TIC' ? 'room_0012' : c.roomId;
        const d0 = (ai + ci + k * 2) % 6;
        let placed = false;
        for (const strict of [true, false]) {
          for (let dd = 0; dd < 6 && !placed; dd++) {
            const d = ((d0 + dd) % 6) + 1;
            if (strict && subjectDays.has(`${a.subjectId}-${d}`)) continue;
            for (let p = 1; p <= (d === 6 ? 4 : 8) && !placed; p++) {
              const ck = `${d}-${p}`;
              if (used.has(ck) || busy.has(`T${a.teacherId}-${ck}`) || busy.has(`R${room}-${ck}`)) continue;
              used.add(ck); busy.add(`T${a.teacherId}-${ck}`); busy.add(`R${room}-${ck}`); subjectDays.add(`${a.subjectId}-${d}`);
              db.schedule.push({ id: id('sch', ++schN), classId: c.id, day: d, period: p, subjectId: a.subjectId, teacherId: a.teacherId, roomId: room, exception: null });
              placed = true;
            }
          }
          if (placed) break;
        }
      }
    });
  });
  const ex = db.schedule.find((s) => s.classId === 'cls_0001' && s.day === 4);
  if (ex) ex.exception = { type: 'SUBSTITUTED', date: '2026-10-15', substituteTeacherId: 'tch_0017', note: 'Guru berhalangan — seminar MEJD Díli' };

  // Scores trimesters 1-3
  db.scores = [];
  db.termGrades = [];
  let scN = 0;
  const ability = {};
  db.students.forEach((s) => (ability[s.id] = 4.2 + rand() * 5));
  db.teachingAssignments.forEach((a) => {
    [1, 2, 3].forEach((tri) => {
      const stu = db.students.filter((s) => s.classId === a.classId);
      const complete = tri < 3 || rand() < 0.55;
      stu.forEach((s) => {
        const b = ability[s.id];
        const g = () => Math.max(0, Math.min(10, round2(b + (rand() - 0.5) * 3)));
        const row = { id: id('sc', ++scN), studentId: s.id, classId: a.classId, subjectId: a.subjectId, trimester: tri, tpc: g(), t1: g(), t2: complete || tri < 3 ? g() : null, ezame: tri < 3 ? g() : complete ? g() : null };
        if (tri === 3 && !complete) { row.t2 = null; row.ezame = null; }
        row.final = computeFinal(row);
        row.situation = situation(row.final);
        db.scores.push(row);
      });
      db.termGrades.push({ id: `tg_${a.id}_${tri}`, classId: a.classId, subjectId: a.subjectId, trimester: tri, status: tri < 3 ? 'FINALIZED' : complete && rand() < 0.3 ? 'FINALIZED' : 'DRAFT', finalizedAt: tri < 3 ? (tri === 1 ? '2026-04-16T09:00:00Z' : '2026-08-13T09:00:00Z') : null });
    });
  });

  db.pautaSubmissions = [
    { id: 'pv_1', protocol: 'PV-NOSSEF-2026-8914', teacherId: 'tch_0003', classId: 'cls_0001', subjectId: 'sub_FIS', trimester: 2, fileName: 'Pauta_Fisica_10CT-A_T2.xlsx', rowsTotal: 26, rowsValid: 26, submittedAt: '2026-08-12T02:14:00Z', status: 'APPROVED', reviewedBy: 'Prof. Dra. Cristina Amaral', reviewNote: 'Konforme.' },
    { id: 'pv_2', protocol: 'PV-NOSSEF-2026-9127', teacherId: 'tch_0004', classId: 'cls_0008', subjectId: 'sub_MAT', trimester: 2, fileName: 'Pauta_MAT_12CT.xlsx', rowsTotal: 22, rowsValid: 22, submittedAt: '2026-08-13T05:40:00Z', status: 'APPROVED', reviewedBy: 'Ir. Maria Gorete Martins', reviewNote: '' },
    { id: 'pv_3', protocol: 'PV-NOSSEF-2026-9733', teacherId: 'tch_0005', classId: 'cls_0005', subjectId: 'sub_BIO', trimester: 3, fileName: 'Valor_Biologia_11CT-A.xlsx', rowsTotal: 25, rowsValid: 24, submittedAt: '2026-10-13T07:02:00Z', status: 'PENDING_DIRECTOR_REVIEW', reviewedBy: null, reviewNote: '' },
    { id: 'pv_4', protocol: 'PV-NOSSEF-2026-9810', teacherId: 'tch_0010', classId: 'cls_0009', subjectId: 'sub_GEG', trimester: 3, fileName: 'Pauta_GEG_12CSH.csv', rowsTotal: 21, rowsValid: 21, submittedAt: '2026-10-14T01:25:00Z', status: 'RETURNED_FOR_REVISION', reviewedBy: 'Ir. Maria Gorete Martins', reviewNote: 'Nilai Teste 2 untuk 3 siswa belum terisi.' },
  ];

  db.reportCards = [];
  let rcN = 0;
  db.students.forEach((s) => {
    [1, 2].forEach((tri) => db.reportCards.push({ id: id('rc', ++rcN), studentId: s.id, trimester: tri, status: 'PUBLISHED', revision: 1, homeroomNote: tri === 1 ? 'Estudante ne’e hatudu esforsu di’ak. Kontinua estuda maka’as.' : 'Progresu di’ak iha trimestre ida-ne’e.', publishedAt: tri === 1 ? '2026-04-20T00:00:00Z' : '2026-08-18T00:00:00Z', verifyToken: crypto.randomBytes(5).toString('hex').toUpperCase() }));
    db.reportCards.push({ id: id('rc', ++rcN), studentId: s.id, trimester: 3, status: 'DRAFT', revision: 0, homeroomNote: '', publishedAt: null, verifyToken: crypto.randomBytes(5).toString('hex').toUpperCase() });
  });
  db.promotions = [];
  db.nationalExams = db.students.filter((s) => s.grade === 12).map((s, i) => ({ id: id('ne', i + 1), studentId: s.id, candidateNo: `EN-2026-ERM-${pad(3100 + i, 5)}`, status: 'REGISTERED', overallScore: null, certificateNo: null }));

  // Attendance: last 10 school days
  db.attendanceSessions = [];
  let asN = 0;
  const days = [];
  const dd = new Date('2026-10-15T00:00:00Z');
  while (days.length < 10) {
    if (dd.getUTCDay() !== 0) days.unshift(dd.toISOString().slice(0, 10));
    dd.setUTCDate(dd.getUTCDate() - 1);
  }
  db.classes.forEach((c) => {
    days.forEach((day) => {
      if (day === today && ['cls_0003', 'cls_0006', 'cls_0009'].includes(c.id)) return; // not yet recorded today
      const records = {};
      db.students.filter((s) => s.classId === c.id).forEach((s) => {
        const r = rand();
        records[s.id] = r < 0.93 ? { status: 'PRESENT' } : r < 0.95 ? { status: 'SICK' } : r < 0.965 ? { status: 'PERMITTED' } : r < 0.985 ? { status: 'ABSENT' } : { status: 'LATE', minutesLate: between(5, 25) };
        if (r >= 0.93 && rand() < 0.4) records[s.id].note = pick(['Surat dokter', 'Família iha funeral', 'Moras isin manas', 'Dalan aat — udan boot']);
      });
      db.attendanceSessions.push({ id: id('att', ++asN), classId: c.id, date: day, mode: 'DAILY', subjectId: null, status: day === today ? 'OPEN' : 'SUBMITTED', version: day === today ? 2 : 4, recordedBy: c.homeroomTeacherId, records });
    });
  });
  db.leaveRequests = [
    { id: 'lv_1', studentId: 'stu_0001', from: '2026-10-20', to: '2026-10-21', type: 'SICK', reason: 'Konsulta médika iha Gleno', status: 'PENDING', submittedBy: 'guardian' },
  ];

  // Finance
  db.feePlans = [
    { id: 'fp_10', grade: 10, label: 'Kelas 10 (Estudante Foun)', etapa1: 85.5, etapa2: 63.0, total: 148.5 },
    { id: 'fp_11', grade: 11, label: 'Kelas 11 (Kontinuasaun)', etapa1: 69.0, etapa2: 63.0, total: 132.0 },
    { id: 'fp_12', grade: 12, label: 'Kelas 12 (Finalista)', etapa1: 74.0, etapa2: 63.0, total: 137.0 },
  ];
  db.scholarshipTypes = [
    { code: 'MERITO', name: 'Bolsa Mérito Akadémiku', discountPct: 50 },
    { code: 'JESUITA', name: 'Bolsa Institusionál Companhia de Jesus', discountPct: 100 },
    { code: 'SOSIAL', name: 'Apoio Sosiál Ermera', discountPct: 30 },
  ];
  db.invoices = [];
  db.payments = [];
  let invN = 400, payN = 0, rcpN = 0;
  const banks = ['BNU Timor', 'Mandiri Timor-Leste', 'BNCTL'];
  db.students.forEach((s) => {
    const fp = db.feePlans.find((f) => f.grade === s.grade);
    const pct = s.scholarship ? db.scholarshipTypes.find((x) => x.code === s.scholarship).discountPct : 0;
    [['Etapa 1 — 2026', fp.etapa1, '2026-03-31'], ['Etapa 2 — 2026', fp.etapa2, '2026-09-30']].forEach(([period, amt, due], ei) => {
      const discount = round2((amt * pct) / 100);
      const total = round2(amt - discount);
      const inv = { id: id('inv', ++invN), invoiceNo: `INV-2026-${pad(invN, 5)}`, studentId: s.id, period, etapa: ei + 1, subtotal: amt, discount, total, paid: 0, status: 'UNPAID', dueDate: due, issuedAt: ei === 0 ? '2026-01-26' : '2026-07-01' };
      db.invoices.push(inv);
      if (total === 0) { inv.status = 'PAID'; return; }
      const r = rand();
      let payAmt = 0;
      if (ei === 0) payAmt = r < 0.9 ? total : r < 0.96 ? round2(total / 2) : 0;
      else payAmt = r < 0.62 ? total : r < 0.75 ? round2(total / 2) : 0;
      if (payAmt > 0) {
        const method = rand() < 0.6 ? 'CASH' : 'BANK_RECEIPT';
        const pending = ei === 1 && method === 'BANK_RECEIPT' && rand() < 0.12;
        const p = {
          id: id('pay', ++payN), paymentNo: `PAY-2026-${pad(payN, 4)}`, studentId: s.id, method, bank: method === 'BANK_RECEIPT' ? pick(banks) : null,
          amount: payAmt, status: pending ? 'PENDING' : 'VERIFIED', allocations: [{ invoiceId: inv.id, amount: payAmt }],
          proofRef: method === 'BANK_RECEIPT' ? `KB-${between(100000, 999999)}` : null, proofFileId: null,
          receivedAt: ei === 0 ? `2026-0${between(2, 3)}-${pad(between(1, 28), 2)}T0${between(1, 6)}:00:00Z` : `2026-${pick(['08', '09', '10'])}-${pad(between(1, 14), 2)}T0${between(1, 6)}:00:00Z`,
          receiptNo: pending ? null : `RCP-2026-${pad(++rcpN, 5)}`, receivedBy: 'Sr. Lourenço Correia', reversalReason: null,
        };
        db.payments.push(p);
        if (!pending) { inv.paid = payAmt; inv.status = payAmt >= total ? 'PAID' : 'PARTIALLY_PAID'; }
      }
    });
  });

  // Admissions
  db.admissionPeriods = [{ id: 'adp_2027', name: 'PPDB 2026/2027', open: '2026-09-15', close: '2026-11-30', status: 'OPEN', quota: 220 }];
  const appStatuses = ['SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'VERIFIED', 'VERIFIED', 'ACCEPTED', 'ACCEPTED', 'WAITING_LIST', 'REJECTED', 'RE_REGISTERED', 'RE_REGISTERED', 'DRAFT'];
  db.applicants = Array.from({ length: 36 }, (_, i) => {
    const gender = rand() < 0.5 ? 'F' : 'M';
    const last = pick(LAST);
    const st = appStatuses[i % appStatuses.length];
    const docsValid = ['VERIFIED', 'ACCEPTED', 'WAITING_LIST', 'RE_REGISTERED', 'REJECTED'].includes(st);
    return {
      id: id('app', i + 1), regNo: `REG-2026-${pad(180 + i, 4)}`, accessToken: `${between(1000, 9999)}`,
      periodId: 'adp_2027', name: `${pick(gender === 'F' ? FIRST_F : FIRST_M)} ${last}`, gender,
      birthPlace: pick(PLACES), birthDate: `2011-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`,
      origin: pick(PRESEC), phone: `+670 77${between(10, 99)} ${between(1000, 9999)}`, email: '', address: `Suco ${pick(SUCOS)}, Ermera`,
      majorPref: rand() < 0.55 ? 'CT' : 'CSH', avgScore: round2(5.5 + rand() * 4),
      guardian: { name: `${pick(FIRST_M)} ${last}`, relation: 'FATHER', occupation: pick(JOBS), phone: `+670 78${between(10, 99)} ${between(1000, 9999)}`, primary: true },
      documents: [
        { type: 'CERTIFICATE', label: 'Ijazah / Sertifikadu Pre-Sekundária', fileName: `ijazah_${i + 1}.pdf`, sizeKb: between(180, 900), status: docsValid ? 'VALID' : 'PENDING' },
        { type: 'BIRTH', label: 'Sertidaun Moris / Batizmu', fileName: `sertidaun_${i + 1}.pdf`, sizeKb: between(120, 600), status: docsValid ? 'VALID' : 'PENDING' },
        { type: 'PHOTO', label: 'Pasfoto 3x4', fileName: `foto_${i + 1}.jpg`, sizeKb: between(60, 300), status: docsValid ? 'VALID' : st === 'DRAFT' ? 'MISSING' : 'PENDING' },
      ],
      testScore: ['SUBMITTED', 'DRAFT'].includes(st) ? null : round2(50 + rand() * 45),
      rank: null, status: st, submittedAt: `2026-${pick(['09', '10'])}-${pad(between(1, 14), 2)}T03:00:00Z`, decisionNote: '',
    };
  });
  const scored = db.applicants.filter((a) => a.testScore != null).sort((a, b) => b.testScore - a.testScore);
  scored.forEach((a, i) => (a.rank = i + 1));

  // Counseling
  const cats = ['AKADÉMIKU', 'FAMÍLIA', 'SOSIÁL', 'SAÚDE MENTÁL', 'KARREIRA', 'DISIPLINA'];
  db.counselingCases = Array.from({ length: 14 }, (_, i) => {
    const s = pick(db.students);
    return {
      id: id('cc', i + 1), caseNo: `BK-2026-${pad(i + 31, 4)}`, studentId: s.id, category: pick(cats), severity: pick(['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL']),
      counselorStaffId: 'stf_0005', status: pick(['OPEN', 'IN_PROGRESS', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']), openedAt: `2026-${pick(['08', '09', '10'])}-${pad(between(1, 14), 2)}`,
      summary: pick(['Estudante hatudu dezempeñu akadémiku tun iha trimestre 3.', 'Problema komunikasaun ho kolega iha klase.', 'Preokupasaun kona-ba kondisaun ekonómika família.', 'Orientasaun karreira ba universidade.', 'Absénsia repetida iha semana rua ikus.']),
      chronology: 'Rejistu konfidensiál — asesu limitadu ba Konselora BK.',
      followUps: [{ at: '2026-10-01T02:00:00Z', by: 'Sra. Perpétua do Rosário', note: 'Enkontru dahuluk ho estudante. Rona nia preokupasaun.' }],
      guardianMeeting: rand() < 0.5 ? '2026-10-22 10:00' : null,
    };
  });
  db.disciplineIncidents = Array.from({ length: 10 }, (_, i) => ({
    id: id('di', i + 1), incidentNo: `DSP-2026-${pad(i + 12, 4)}`, studentId: pick(db.students).id, occurredAt: `2026-${pick(['09', '10'])}-${pad(between(1, 14), 2)}T01:30:00Z`,
    category: pick(['TARDINESS', 'UNIFORM', 'ABSENCE', 'MISCONDUCT', 'PHONE_USE']), severity: pick(['LOW', 'MEDIUM', 'HIGH']),
    actionTaken: pick(['Admoestasaun verbál', 'Karta ba inan-aman', 'Servisu komunitáriu eskola', 'Enkontru ho Profesor da Turma']), status: pick(['OPEN', 'RESOLVED', 'RESOLVED']), reportedBy: pick(db.teachers).name,
  }));

  // Extracurricular
  db.activities = [
    { id: 'act_1', unit: 'KORENOSSEF', name: 'KORENOSSEF — Konsellu Reprezentante Estudante', advisorTeacherId: 'tch_0009', capacity: 30, schedule: 'Sesta 14:00', generation: 'Gerasaun XXIV (2026)' },
    { id: 'act_2', unit: 'PASTORAL', name: 'Ekipa Pastoral Eskolár', advisorTeacherId: 'tch_0016', capacity: 50, schedule: 'Kinta 14:00 & Domingu Misa', generation: '' },
    { id: 'act_3', unit: 'DRUMBAND', name: 'Ekipa Drum Band / Fanfarra NOSSEF', advisorTeacherId: 'tch_0012', capacity: 60, schedule: 'Tersa & Sábadu 14:30', generation: '' },
    { id: 'act_4', unit: 'OTHER', name: 'Klube Futeból & Voleiból', advisorTeacherId: 'tch_0012', capacity: 40, schedule: 'Kuarta 15:00', generation: '' },
    { id: 'act_5', unit: 'OTHER', name: 'Klube Siénsia & Matemátika', advisorTeacherId: 'tch_0017', capacity: 25, schedule: 'Segunda 14:00', generation: '' },
  ];
  const roles = {
    act_1: ['Presidente KORENOSSEF', 'Vise-Presidente', 'Sekretáriu', 'Tesoureiru', 'Divizaun Liturjia', 'Divizaun Desportu', 'Divizaun Kultura', 'Divizaun Disiplina', 'Membru'],
    act_2: ['Divizaun Liturjia', 'Koru Múzika Sakra', 'Acólitos', 'Leitór', 'Karitas & Asaun Sosiál', 'Retiru Espirituál'],
    act_3: ['Naipe Snare Drum', 'Naipe Bass Drum', 'Naipe Perkusaun', 'Liras & Sinos', 'Trompete Fanfarra', 'Mayorette', 'Pasukan Pengibar Bandeira', 'Maestro / Mayor'],
    act_4: ['Atleta Futeból', 'Atleta Voleiból', 'Kapitaun Ekipa'],
    act_5: ['Membru', 'Koordenadór Olimpíada'],
  };
  db.memberships = [];
  let memN = 0;
  db.activities.forEach((a) => {
    const n = { act_1: 24, act_2: 41, act_3: 45, act_4: 30, act_5: 18 }[a.id];
    const pool = [...db.students].sort(() => rand() - 0.5).slice(0, n);
    pool.forEach((s, i) => db.memberships.push({ id: id('mem', ++memN), activityId: a.id, studentId: s.id, role: i === 0 ? roles[a.id][0] : pick(roles[a.id].slice(1)), joinedAt: `20${between(24, 26)}-0${between(2, 9)}-${pad(between(1, 28), 2)}`, status: rand() < 0.92 ? 'ACTIVE' : pick(['COMPLETED', 'WITHDRAWN']) }));
  });

  // Library
  const books = [
    ['978-972-0-34567-1', 'Os Lusíadas', 'Luís de Camões', 'Literatura'], ['978-989-8789-12-3', 'Istória Timor-Leste', 'Geoffrey C. Gunn', 'História'],
    ['978-602-03-1234-5', 'Fisika untuk SMA Kelas X', 'Marthen Kanginan', 'Siénsia'], ['978-0-19-852663-6', 'Oxford English Grammar', 'Sidney Greenbaum', 'Lian'],
    ['978-972-47-2345-9', 'Matemática A 10.º Ano', 'Maria Augusta Neves', 'Matemátika'], ['978-972-0-20012-3', 'Química 11', 'Carlos Corrêa', 'Siénsia'],
    ['978-989-20-5555-1', 'Dicionário Tétum-Português', 'Luís Costa', 'Lian'], ['978-0-14-118776-1', 'Animal Farm', 'George Orwell', 'Literatura'],
    ['978-972-662-123-4', 'Biologia e Geologia 10', 'Amparo Dias da Silva', 'Siénsia'], ['978-602-8519-93-9', 'Ekonomi SMA Kelas XI', 'Alam S.', 'Ekonomia'],
    ['978-972-41-1111-2', 'A Mensagem', 'Fernando Pessoa', 'Literatura'], ['978-1-1234-5678-0', 'Konstituisaun RDTL', 'Parlamentu Nasionál', 'Sidadania'],
    ['978-972-0-41234-7', 'Geografia A 11', 'Fernanda Teixeira', 'Jeografia'], ['978-0-06-112008-4', 'To Kill a Mockingbird', 'Harper Lee', 'Literatura'],
    ['978-972-38-0001-5', 'Bíblia Sagrada — Edição Pastoral', 'Paulus', 'Relijiaun'], ['978-602-0000-11-2', 'Sosiologi untuk SMA', 'Kun Maryati', 'Sosiolojia'],
  ];
  db.libraryBooks = books.map(([isbn, title, author, category], i) => ({ id: id('bk', i + 1), isbn, title, author, category, year: between(1990, 2024) }));
  db.libraryCopies = [];
  let cpN = 800;
  db.libraryBooks.forEach((b) => {
    const n = between(2, 7);
    for (let k = 0; k < n; k++) db.libraryCopies.push({ id: id('cp', ++cpN), bookId: b.id, barcode: `BC-NOS-${pad(cpN, 5)}`, status: rand() < 0.05 ? 'REPAIR' : 'AVAILABLE', acquiredAt: '2023-02-01' });
  });
  db.loans = [];
  let lnN = 0;
  db.libraryCopies.filter((c) => c.status === 'AVAILABLE').forEach((c) => {
    if (rand() < 0.35) {
      const borrowedDay = between(16, 40);
      const b = new Date('2026-10-15T00:00:00Z'); b.setUTCDate(b.getUTCDate() - borrowedDay);
      const due = new Date(b); due.setUTCDate(due.getUTCDate() + 14);
      const isTeacher = rand() < 0.15;
      const borrower = isTeacher ? pick(db.teachers) : pick(db.students);
      const overdue = due.toISOString().slice(0, 10) < '2026-10-15';
      c.status = 'ON_LOAN';
      db.loans.push({ id: id('ln', ++lnN), copyId: c.id, borrowerType: isTeacher ? 'TEACHER' : 'STUDENT', borrowerId: borrower.id, borrowedAt: b.toISOString().slice(0, 10), dueAt: due.toISOString().slice(0, 10), returnedAt: null, fine: 0, condition: null, status: overdue ? 'OVERDUE' : 'OPEN', renewals: 0 });
    }
  });
  // Demo student stu_0001 has an open loan
  const freeCopy = db.libraryCopies.find((c) => c.status === 'AVAILABLE');
  freeCopy.status = 'ON_LOAN';
  db.loans.push({ id: id('ln', ++lnN), copyId: freeCopy.id, borrowerType: 'STUDENT', borrowerId: 'stu_0001', borrowedAt: '2026-10-08', dueAt: '2026-10-22', returnedAt: null, fine: 0, condition: null, status: 'OPEN', renewals: 0 });

  // Assets
  const assetDef = [
    ['LAB', 'Laboratóriu IPA', 'Mikroskópiu Binokulár Olympus CX23', 'room_0010', 640], ['LAB', 'Laboratóriu IPA', 'Kit Eletrisidade & Magnetizmu', 'room_0010', 320], ['LAB', 'Laboratóriu IPA', 'Balansa Analítika Ohaus', 'room_0011', 890],
    ['IT', 'Komputer & IT', 'Laptop Lenovo ThinkPad E14', 'room_0012', 780], ['IT', 'Komputer & IT', 'Projetor Epson EB-X51', 'room_0001', 520], ['IT', 'Komputer & IT', 'Router Starlink Business', null, 2500], ['IT', 'Komputer & IT', 'Impresora Canon iR2425', null, 1450],
    ['FUR', 'Perabot Kelas', 'Meja + Kadeira Estudante (set 36)', 'room_0005', 1800], ['FUR', 'Perabot Kelas', 'Kuadru Branku 240x120', 'room_0003', 160],
    ['MUS', 'Alat Musik Drum Band', 'Snare Drum Yamaha MS-9214', null, 410], ['MUS', 'Alat Musik Drum Band', 'Bass Drum Marching 22"', null, 560], ['MUS', 'Alat Musik Drum Band', 'Lira / Bell Lyre 27 nota', null, 230],
    ['GEN', 'Fasilidade Jerál', 'Jeradór Eletrisidade Honda 5kVA', null, 1350], ['GEN', 'Fasilidade Jerál', 'Tanki Bee 5000L', null, 900],
  ];
  db.assets = [];
  assetDef.forEach(([code, cat, name, room, cost], i) => {
    const copies = code === 'IT' && i === 3 ? 6 : code === 'MUS' ? 3 : 1;
    for (let k = 0; k < copies; k++) {
      const n = db.assets.length + 1;
      const cond = pick(['GOOD', 'GOOD', 'GOOD', 'FAIR', 'DAMAGED']);
      const status = cond === 'DAMAGED' ? 'MAINTENANCE' : rand() < 0.4 ? 'ASSIGNED' : 'AVAILABLE';
      db.assets.push({
        id: id('ast', n), assetNo: `AST-${code}-2026-${pad(n, 3)}`, name, serial: `SN${between(100000, 999999)}`, category: cat, roomId: room,
        assignee: status === 'ASSIGNED' ? pick(db.teachers).name : null, condition: cond, cost, status, acquiredAt: `20${between(19, 26)}-0${between(1, 9)}-15`,
        history: [{ at: '2026-02-01', type: 'REGISTERED', note: 'Rejistu inisiál iha inventáriu' }].concat(status === 'MAINTENANCE' ? [{ at: '2026-10-02', type: 'MAINTENANCE', note: 'Haruka ba reparasaun — Díli' }] : []),
      });
    }
  });

  // Communications
  db.announcements = [
    { id: 'ann_1', title: 'Kalendáriu CAU 3 — Trimestre 3 2026', body: 'Ezame CAU 3 sei hala’o iha loron 16 to’o 27 Novembru 2026. Estudante hotu tenke prepara an didi’ak no tuir regulamentu ezame.', audience: ['ALL'], status: 'PUBLISHED', publishAt: '2026-10-10T00:00:00Z', author: 'Ir. Maria Gorete Martins', push: true },
    { id: 'ann_2', title: 'Pagamentu Propina Etapa 2', body: 'Prazu pagamentu propina Etapa 2 ($63.00) remata ona iha 30 Setembru. Favor kompleta pagamentu iha Tesouraria ka via BNU / Mandiri / Telemor Mosan.', audience: ['GUARDIAN', 'STUDENT'], status: 'PUBLISHED', publishAt: '2026-10-01T00:00:00Z', author: 'Sr. Lourenço Correia', push: true },
    { id: 'ann_3', title: 'Reuniaun Profesor da Turma', body: 'Profesor da Turma hotu konvidadu ba reuniaun koordenasaun iha Sala Profesór, Sesta 17 Outubru, oras 13:30.', audience: ['ROLE:HOMEROOM_TEACHER', 'ROLE:TEACHER'], status: 'PUBLISHED', publishAt: '2026-10-13T00:00:00Z', author: 'Prof. Dra. Cristina Amaral', push: false },
    { id: 'ann_4', title: 'Misa Fatin Festa Nossa Senhora do Rosário', body: 'Misa komunidade eskolár sei hala’o iha Igreja Railaco, Segunda 20 Outubru, oras 07:00. Uniforme kompletu.', audience: ['ALL'], status: 'SCHEDULED', publishAt: '2026-10-17T00:00:00Z', author: 'Pe. José Carvalho, SJ', push: true },
    { id: 'ann_5', title: 'Rejistu Ezame Nasionál 12º Ano', body: 'Estudante 12º ano tenke konfirma dadus kandidatu ba Ezame Nasionál antes 31 Outubru.', audience: ['GRADE:12'], status: 'DRAFT', publishAt: null, author: 'Sra. Imaculada Hornai', push: false },
  ];
  db.calendarEvents = [
    { id: 'ev_1', date: '2026-10-20', title: 'Misa Nossa Senhora do Rosário', type: 'RELIGIOUS' },
    { id: 'ev_2', date: '2026-11-02', title: 'Feriadu — Loron Mate-Na’in', type: 'HOLIDAY' },
    { id: 'ev_3', date: '2026-11-12', title: 'Feriadu — Loron Joventude Nasionál', type: 'HOLIDAY' },
    { id: 'ev_4', date: '2026-11-16', title: 'Hahú Ezame CAU 3', type: 'EXAM' },
    { id: 'ev_5', date: '2026-11-28', title: 'Feriadu — Loron Proklamasaun Independénsia', type: 'HOLIDAY' },
    { id: 'ev_6', date: '2026-12-04', title: 'Remata Tinan Akadémiku 2026', type: 'ACADEMIC' },
  ];
  db.notifications = [
    { id: 'nt_1', target: 'ALL', event: 'announcement.published', title: 'Kalendáriu CAU 3 publika ona', body: 'Haree detalle iha Ánunsiu.', at: '2026-10-10T00:10:00Z', readBy: [], link: '/announcements' },
    { id: 'nt_2', target: 'ROLE:PRINCIPAL', event: 'grade.pauta.submitted', title: 'Pauta foun: PV-NOSSEF-2026-9733', body: 'Biologia 11º CT-A — Prof.ª Lúcia Guterres', at: '2026-10-13T07:02:00Z', readBy: [], link: '/grades/submissions' },
    { id: 'nt_3', target: 'ROLE:CURRICULUM_ADMIN', event: 'grade.pauta.submitted', title: 'Pauta foun: PV-NOSSEF-2026-9733', body: 'Biologia 11º CT-A — Prof.ª Lúcia Guterres', at: '2026-10-13T07:02:00Z', readBy: [], link: '/grades/submissions' },
    { id: 'nt_4', target: 'ROLE:FINANCE_ADMIN', event: 'finance.payment.pending', title: 'Kuitansi banku foun', body: 'Iha kuitansi banku sira ne’ebé presiza verifika.', at: '2026-10-14T03:00:00Z', readBy: [], link: '/finance?tab=pending' },
    { id: 'nt_5', target: 'GUARDIAN:grd_0001', event: 'attendance.absent', title: 'Informasaun prezensa', body: 'Haree rejistu prezensa oan nian.', at: '2026-10-14T00:30:00Z', readBy: [], link: '/guardian/home' },
    { id: 'nt_6', target: 'ROLE:TEACHER', event: 'report_card.deadline', title: 'Prazu entrega pauta CAU 3', body: 'Janela input valor: 20 Nov – 08 Dez 2026.', at: '2026-10-12T00:00:00Z', readBy: [], link: '/grades/gradebook' },
  ];
  db.reportJobs = [
    { id: 'job_1', kind: 'REPORT', code: 'FIN-03', name: 'Rekapitulasi Tunggakan SPP', format: 'XLSX', status: 'SUCCEEDED', progress: 100, createdAt: '2026-10-14T02:00:00Z', by: 'finance' },
    { id: 'job_2', kind: 'REPORT', code: 'ATT-02', name: 'Rekap Presensi Bulanan per Rombel', format: 'PDF', status: 'SUCCEEDED', progress: 100, createdAt: '2026-10-13T08:30:00Z', by: 'kurikulum' },
    { id: 'job_3', kind: 'IMPORT', code: 'IMP-SCORES', name: 'Import Nilai — Biologia 11º CT-A', format: 'XLSX', status: 'FAILED', progress: 100, createdAt: '2026-10-12T05:10:00Z', by: 'lucia.guterres', error: '2 baris: ASSESSMENT_SCORE_OUT_OF_RANGE' },
  ];

  // Users (password for all demo accounts: nossef2026)
  const pw = hashPassword('nossef2026', 'nossefdemo');
  const g1Id = g1.id;
  db.users = [
    ['admin', 'Administrador Sistema', ['SUPER_ADMIN'], null, null],
    ['cristina.amaral', 'Prof. Dra. Cristina Amaral', ['PRINCIPAL'], 'TEACHER', 'tch_0001'],
    ['maria.martins', 'Ir. Maria Gorete Martins', ['CURRICULUM_ADMIN'], 'TEACHER', 'tch_0002'],
    ['sekretaria', 'Sra. Imaculada Hornai', ['SCHOOL_ADMIN', 'SECRETARY'], 'STAFF', 'stf_0001'],
    ['finansas', 'Sr. Lourenço Correia', ['FINANCE_ADMIN'], 'STAFF', 'stf_0002'],
    ['admisaun', 'Sr. Natalino Mau', ['ADMISSION_OFFICER'], 'STAFF', 'stf_0006'],
    ['antonio.soares', 'Prof. António da Costa Soares', ['TEACHER', 'HOMEROOM_TEACHER'], 'TEACHER', 'tch_0003'],
    ['domingos.ximenes', 'Prof. Domingos Ximenes', ['TEACHER', 'HOMEROOM_TEACHER'], 'TEACHER', 'tch_0004'],
    ['agostinho.freitas', 'Prof. Agostinho Freitas', ['TEACHER'], 'TEACHER', 'tch_0008'],
    ['konselora', 'Sra. Perpétua do Rosário', ['COUNSELOR'], 'STAFF', 'stf_0005'],
    ['biblioteka', 'Sra. Albertina Leki', ['LIBRARIAN'], 'STAFF', 'stf_0003'],
    ['patrimoniu', 'Sr. Gaspar Siqueira', ['ASSET_OFFICER'], 'STAFF', 'stf_0004'],
    ['estudante', db.students[0].name, ['STUDENT'], 'STUDENT', 'stu_0001'],
    ['inan-aman', g1.name, ['GUARDIAN'], 'GUARDIAN', g1Id],
  ].map(([username, name, roles, profileType, profileId], i) => ({
    id: id('usr', i + 1), username, email: `${username}@nossef-railaco.tl`, name, roles, profileType, profileId,
    status: 'ACTIVE', lastLogin: i < 8 ? `2026-10-${pad(between(10, 14), 2)}T0${between(0, 8)}:${between(10, 59)}:00Z` : null, passwordHash: pw,
    roleValidFrom: '2026-01-01', roleValidUntil: '2026-12-31',
  }));
  db.users.push({ id: 'usr_0099', username: 'ex.profesor', email: 'ex.profesor@nossef-railaco.tl', name: 'Prof. Silvino Pinto (Ex-Guru)', roles: ['TEACHER'], profileType: null, profileId: null, status: 'DISABLED', lastLogin: '2025-11-30T03:00:00Z', passwordHash: pw, roleValidFrom: '2024-01-01', roleValidUntil: '2025-12-31' });

  // Historical archive 2002-2026 (aggregated)
  db.archive = [];
  for (let y = 2002; y <= 2026; y++) {
    const base = 80 + Math.round((y - 2002) * 22 + rand() * 30);
    const graduates = y >= 2004 ? Math.round(base * 0.31) : 0;
    db.archive.push({ year: y, enrolled: Math.min(base, 650), male: 0, female: 0, graduates, ctGrad: Math.round(graduates * 0.55), cshGrad: graduates - Math.round(graduates * 0.55), passRate: y >= 2004 ? round2(78 + rand() * 18) : null });
  }
  db.archive.forEach((a) => { a.female = Math.round(a.enrolled * (0.48 + rand() * 0.06)); a.male = a.enrolled - a.female; });
  db.alumni = Array.from({ length: 40 }, (_, i) => {
    const y = between(2004, 2025);
    const gender = rand() < 0.5 ? 'F' : 'M';
    return { id: id('alm', i + 1), studentNo: `NOS-${y - 3}-${pad(between(1, 600), 4)}`, name: `${pick(gender === 'F' ? FIRST_F : FIRST_M)} ${pick(LAST)}`, gender, gradYear: y, major: rand() < 0.55 ? 'CT' : 'CSH', finalAvg: round2(5.2 + rand() * 4.3), destination: pick(['UNTL Díli', 'UNPAZ', 'UNITAL', 'Universidade Católica Timorense', 'Indonézia — Kupang', 'Portugál — Bolsa', 'Servisu', 'Agrikultura Kafé']) };
  });

  // Audit trail seed
  db.auditLogs = [
    { id: 'aud_1', at: '2026-10-14T03:12:00Z', actor: 'finansas', eventType: 'PAYMENT_VERIFIED', target: 'payments/pay_0003', before: { status: 'PENDING' }, after: { status: 'VERIFIED' }, requestId: 'req-7f3a91c2', ip: '10.10.1.24' },
    { id: 'aud_2', at: '2026-10-13T07:02:00Z', actor: 'lucia.guterres', eventType: 'PAUTA_SUBMITTED', target: 'pautaSubmissions/pv_3', before: null, after: { protocol: 'PV-NOSSEF-2026-9733', status: 'PENDING_DIRECTOR_REVIEW' }, requestId: 'req-1b9c44e0', ip: '10.10.1.51' },
    { id: 'aud_3', at: '2026-10-12T01:40:00Z', actor: 'admin', eventType: 'ROLE_ASSIGNED', target: 'users/usr_0008', before: { roles: ['TEACHER'] }, after: { roles: ['TEACHER', 'HOMEROOM_TEACHER'] }, requestId: 'req-55d1e0aa', ip: '10.10.1.2' },
    { id: 'aud_4', at: '2026-10-11T02:22:00Z', actor: 'konselora', eventType: 'COUNSELING_CASE_ACCESSED', target: 'counselingCases/cc_0004', before: null, after: null, requestId: 'req-9a0c7d11', ip: '10.10.1.33' },
    { id: 'aud_5', at: '2026-08-20T04:00:00Z', actor: 'maria.martins', eventType: 'TERM_GRADE_REOPENED', target: 'termGrades/tg_ta_0012_2', before: { status: 'FINALIZED' }, after: { status: 'DRAFT', reason: 'Koreksaun erru input Teste 2' }, requestId: 'req-3e2b8f90', ip: '10.10.1.12' },
    { id: 'aud_6', at: '2026-09-02T06:15:00Z', actor: 'finansas', eventType: 'PAYMENT_REVERSED', target: 'payments/pay_0011', before: { status: 'VERIFIED', amount: 63 }, after: { status: 'REVERSED', reason: 'Pagamentu duplikadu' }, requestId: 'req-c41d22b7', ip: '10.10.1.24' },
  ];
  db.counters = { protocol: 9900, invoice: invN, payment: payN, receipt: rcpN, audit: 6, applicant: 216, caseNo: 45, loan: lnN, asset: db.assets.length, notification: 6, job: 3 };
  return db;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { openStore, DB_PATH } = await import('./store.js');
  const store = openStore();
  if (!store.isEmpty() && !process.argv.includes('--force')) {
    console.log('Database already exists. Use --force to regenerate.');
  } else {
    store.reset(buildSeed());
    console.log('Seeded', DB_PATH);
  }
}
