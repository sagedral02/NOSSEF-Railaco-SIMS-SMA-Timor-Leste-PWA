// k6 load scenario (F14-13): login once per VU, then read-heavy staff traffic.
//   k6 run -e BASE=https://sims.example.tl -e USER=maria.martins -e PASS=... infra/k6/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: { staff: { executor: 'ramping-vus', stages: [{ duration: '1m', target: 30 }, { duration: '3m', target: 30 }, { duration: '30s', target: 0 }] } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] },
};
const BASE = __ENV.BASE || 'http://localhost:3000';

export function setup() {
  const csrf = http.get(`${BASE}/api/v1/auth/csrf/`).json('data.csrf_token');
  return { csrf };
}

export default function (data) {
  const jar = http.cookieJar();
  if (!jar.cookiesForURL(BASE).sessionid) {
    const csrf = http.get(`${BASE}/api/v1/auth/csrf/`).json('data.csrf_token');
    const r = http.post(`${BASE}/api/v1/auth/login/`, JSON.stringify({ username: __ENV.USER, password: __ENV.PASS }), { headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf, Referer: BASE } });
    check(r, { 'login 200': (x) => x.status === 200 });
  }
  for (const path of ['/api/v1/auth/me/', '/api/v1/dashboard/', '/api/v1/students/?page_size=25', '/api/v1/academic-years/', '/api/v1/announcements/feed/']) {
    const r = http.get(`${BASE}${path}`);
    check(r, { [`${path} ok`]: (x) => x.status === 200 });
  }
  sleep(1);
}
