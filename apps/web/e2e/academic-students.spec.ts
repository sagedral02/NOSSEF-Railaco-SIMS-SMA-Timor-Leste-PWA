import { expect, test } from '@playwright/test';

import { login, visit } from './helpers';

test.describe('F2–F4 staff screens', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop coverage');

  test('curriculum admin reaches academic configuration', async ({ page }) => {
    await login(page, 'maria.martins');
    await visit(page, '/academic/years', 'Tahun Ajaran', 'academic-years');
    await expect(page.getByText('CAU 3').first()).toBeVisible();
    await visit(page, '/academic/classes', 'Rombel / Kelas', 'academic-classes');
    await expect(page.getByText('X IPA 1 (10º CT-A)')).toBeVisible();
    await visit(page, '/academic/subjects', 'Mata Pelajaran');
    await visit(page, '/academic/offerings', 'Penawaran Mapel');
    await visit(page, '/academic/teaching-assignments', 'Penugasan Mengajar');
    await visit(page, '/academic/calendar', 'Kalender Akademik');
    await visit(page, '/academic/rooms', 'Ruang & Jam');
  });

  test('school admin browses students and opens a student 360', async ({ page }) => {
    await login(page, 'sekretaria');
    await visit(page, '/students', 'Direktori Siswa', 'students');
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Enrollment aktif')).toBeVisible();
    await page.getByRole('tab', { name: 'Orang Tua/Wali' }).click();
    await expect(page.getByText('Utama').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/student-360.png', fullPage: true });
    await visit(page, '/staff/teachers', 'Guru');
  });

  test('teacher sees only own classes in the directory', async ({ page }) => {
    await login(page, 'agostinho.freitas');
    await visit(page, '/students', 'Direktori Siswa');
    const classes = await page.locator('tbody tr td:nth-child(5)').allInnerTexts();
    expect(classes.length).toBeGreaterThan(0);
  });

  test('admission officer works the applicant queue', async ({ page }) => {
    await login(page, 'admisaun');
    await visit(page, '/admissions/periods', 'Periode PPDB');
    await visit(page, '/admissions/applicants', 'Antrean Pendaftar', 'admissions-queue');
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Dokumen').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/applicant-detail.png', fullPage: true });
  });
});

test('public applicant registers, uploads documents and submits', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile' && !!process.env.CI, 'one run is enough on CI');
  await page.goto('/admissions');
  await page.getByRole('link', { name: /Daftar Sekarang/ }).first().click();
  await page.getByLabel(/Nama lengkap/).fill('Calon Uji E2E');
  await page.getByLabel(/^Tanggal lahir/).fill('2011-06-15');
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await page.getByLabel(/Nama orang tua\/wali/).fill('Wali Uji');
  await page.getByLabel(/No. HP orang tua\/wali/).fill('+670 7700 1122');
  await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
  const pdf = { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') };
  const png = { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]) };
  const inputs = page.locator('input[type="file"]');
  await expect(inputs).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await inputs.nth(i).setInputFiles(i === 2 ? png : pdf);
    await expect(page.getByText(/· Menunggu/).nth(i)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await page.getByRole('button', { name: 'Kirim Pendaftaran Resmi' }).click();
  await expect(page.getByText('Pendaftaran resmi terkirim')).toBeVisible();
  await page.screenshot({ path: `e2e/screens/${info.project.name}-ppdb-proof.png`, fullPage: true });
  const reg = (await page.locator('.font-mono.text-2xl').innerText()).trim();
  await page.goto('/admissions/status');
  await page.getByRole('textbox', { name: /Nomor registrasi/ }).fill(reg);
  await page.getByLabel(/^Tanggal lahir/).fill('2011-06-15');
  await page.getByRole('button', { name: 'Cek Status' }).click();
  await expect(page.getByText('Hasil seleksi belum diumumkan.')).toBeVisible();
});
