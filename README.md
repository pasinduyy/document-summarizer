# Document Summarizer Platform

## Overview

An asynchronous document summarization platform with a Next.js frontend, NestJS API and worker,
PostgreSQL, and Redis/BullMQ. It accepts multiple files, processes them in the background, and
provides status polling, preview, summary, category, and confidence results.

## Current Scope

- Supports TXT and PDF files only.
- Accepts up to 10 files per request, with a 10 MB limit for each file.
- Uses deterministic mock rules as the current analysis provider.
- Image/OCR support and an OpenAI adapter are not implemented.
- This is a local-development implementation; the separate system-design document describes its
  production evolution.

## Prerequisites

- A current Node.js LTS release (the repository does not pin an exact version)
- npm
- Docker Desktop with Docker Compose

Install workspace dependencies from the repository root:

```powershell
npm install
```

## Environment Setup

```powershell
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env.local
```

No real secrets are required for the local mock-provider flow.

## Start Local Infrastructure

Docker Compose starts PostgreSQL and Redis only. Run the API, worker, and web application
separately with npm scripts.

```powershell
docker compose up -d
docker compose ps
```

## Build Services and Web Together

```powershell
npm run build
```

## Run Database Migrations

```powershell
npm run prisma:migrate --workspace=@document-summarizer/database
```

## Run the Application

Run each command in a separate terminal.

API:

```powershell
npm run start:dev --workspace=api
```

Worker:

```powershell
npm run start:dev --workspace=worker
```

Web:

```powershell
npm run dev --workspace=web
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/api
- The worker has no HTTP port.

## Verify the Application

1. Open the web app.
2. Upload one TXT or PDF file.
3. Observe the queued, processing, and completed state updates.
4. Select the completed document.
5. Confirm its preview, summary, category, and confidence appear together.

Swagger can also test `POST /documents`, `GET /documents`, and `GET /documents/:id`.

## Tests and Quality Checks

```powershell
npm run build
npm run test --workspace=api -- --runInBand
npm run test --workspace=worker -- --runInBand
npm run lint --workspace=web
npm run format:check
```

## Project Documentation

- [docs/SYSTEM_DESIGN_V2.pdf](docs/SYSTEM_DESIGN_V2.pdf) describes the architecture and its
  production evolution.

The requested `docs/SYSTEM_DESIGN.md`, `docs/SYSTEM_DESIGN.pdf`, and
`docs/IMPLEMENTATION_GUIDE.md` are not present in this checkout.

## Known Limitations

- TXT/PDF only; image/OCR is deferred.
- Deterministic mock analysis; an OpenAI adapter is deferred.
- Docker Compose starts infrastructure only.
- The worker has no HTTP health endpoint.
- There is no authentication, malware scanning, retention automation, metrics, tracing, or
  alerting.

These areas and the production evolution are discussed in the
[system design document](docs/SYSTEM_DESIGN_V2.pdf).
