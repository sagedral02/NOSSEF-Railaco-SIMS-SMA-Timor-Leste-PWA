# ADR-001: Modular monolith instead of microservices

- Status: Accepted
- Date: 2026-10-15
- PRD: §76

## Context

One SMA, a small IT team and unstable connectivity. A single deployable Django project with strict module boundaries (`apps/api/modules/<domain>`) keeps transactions local and operations simple.

## Decision

Modules talk through services/selectors, never by importing each other's views. Cross-module side effects use `common.events` (after-commit), not a broker. Splitting into services requires a new ADR.
