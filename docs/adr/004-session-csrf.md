# ADR-004: Session/CSRF browser authentication

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

Long-lived tokens in localStorage are exposed to XSS. Django session cookies are HttpOnly; CSRF protects unsafe requests.

## Decision

The browser talks to one origin; Next.js proxies `/api/*` to Django in development and the reverse proxy does it in production. Login/reset endpoints enforce CSRF explicitly. Unauthenticated → 401 `AUTH_NOT_AUTHENTICATED`; CSRF failure → 403 `AUTH_CSRF_FAILED`.
