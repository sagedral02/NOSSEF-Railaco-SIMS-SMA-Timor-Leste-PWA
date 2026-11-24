# Go-live checklist (PRD F15)

- [ ] F15-01 Master data frozen and cleaned (grade levels, majors IPA/IPS, subjects, rooms, bell periods).
- [ ] F15-02 Students/guardians/teachers imported via **Sistem → Impor Data** (preview, fix errors, confirm). Keep the result CSVs.
- [ ] F15-03 Current academic year with three trimestres (CAU 1–3) activated (**Akademik → Tahun Ajaran → Aktifkan** shows the readiness list).
- [ ] F15-04 Rombels with homeroom teachers, offerings, teaching assignments, schedules (no collisions — INT-008).
- [ ] F15-05 SPP fee plans active; opening balances entered as manual invoices if needed.
- [ ] F15-06 Real accounts created with least privilege; demo accounts absent.
- [ ] F15-07 `python manage.py go_live_check --strict` passes; reports STU-01/ACA-01/FIN-01 reviewed by the school.
- [ ] F15-08 Pre-launch backup taken **and** restored in a drill.
- [ ] F15-09 Release tag deployed.
- [ ] F15-10 Smoke test: admin, teacher (attendance + gradebook), student, guardian (dashboard, finance, report cards), finance (cash payment + receipt).
- [ ] F15-11 Monitor errors/queues/DB daily during the first two weeks.
- [ ] F15-12 First attendance day reconciled (ATT-01 vs paper roll).
- [ ] F15-13 First payment batch reconciled (FIN-06 vs cash box).
- [ ] F15-14 Bugs triaged into releases.
- [ ] F15-15 Baseline release tagged; PRD/ADR versions preserved.
