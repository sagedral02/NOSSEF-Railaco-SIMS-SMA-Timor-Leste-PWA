import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Makes the suite repeatable: today's attendance sessions are recreated by the tests.
export default function globalSetup() {
  const api = join(import.meta.dirname, '..', '..', 'api');
  const python = [join(api, '.venv', 'Scripts', 'python.exe'), join(api, '.venv', 'bin', 'python')].find(existsSync) ?? 'python';
  execFileSync(python, ['manage.py', 'e2e_reset_today'], { cwd: api, stdio: 'inherit' });
}
