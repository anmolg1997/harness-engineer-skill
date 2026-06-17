# 1. Use uv for dependency management

Date: 2026-06-17
Status: Accepted

## Context
We need reproducible, fast Python installs.

## Decision
Use uv with a committed uv.lock and a pinned requires-python.

## Consequences
Reproducible environments across machines and CI.
