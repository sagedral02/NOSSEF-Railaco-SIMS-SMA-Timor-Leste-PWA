# ADR-002: Django/DRF backend

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

Django 5.2 LTS gives migrations, auth, admin, transactions and a mature security baseline; DRF gives serializers, permissions, throttling and OpenAPI via drf-spectacular.

## Decision

Business rules live in `services.py` per module. Views only orchestrate HTTP. The OpenAPI schema is generated and committed to `packages/api-contracts`.
