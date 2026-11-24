// Regenerates openapi.yaml from Django (drf-spectacular) and the TS types from it.
// Run after any API change: `pnpm api:schema`. CI fails if the committed files are stale.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const api = resolve(pkg, '..', '..', 'apps', 'api');
const winPy = join(api, '.venv', 'Scripts', 'python.exe');
const posixPy = join(api, '.venv', 'bin', 'python');
const python = existsSync(winPy) ? winPy : existsSync(posixPy) ? posixPy : 'python';
const schema = join(pkg, 'openapi.yaml');

execFileSync(python, ['manage.py', 'spectacular', '--file', schema, '--validate'], {
  cwd: api,
  stdio: 'inherit',
  env: { ...process.env, DJANGO_SETTINGS_MODULE: 'config.settings.test' },
});
execFileSync(process.execPath, [join(pkg, 'node_modules', 'openapi-typescript', 'bin', 'cli.js'), schema, '-o', join(pkg, 'src', 'schema.d.ts')], {
  stdio: 'inherit',
});
