# ZecFlow Automation Platform

ZecFlow is a full-stack reference implementation that demonstrates how to orchestrate privacy-preserving workflows on top of the Nillion network. It combines an Express/Mongo backend that manages workflows, runs, NilAI/NilDB interactions and background jobs, with a Vite/React frontend that showcases interactive demos (medical diagnosis, loan evaluation) and a builder dashboard.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
   1. [Repository Layout](#repository-layout)
   2. [Server Architecture](#server-architecture)
   3. [Workflow Engine & Blocks](#workflow-engine--blocks)
   4. [Nillion Integrations](#nillion-integrations)
   5. [Frontend Experience](#frontend-experience)
2. [Key Features](#key-features)
3. [Environment Configuration](#environment-configuration)
   1. [Server Environment Variables](#server-environment-variables)
   2. [Client Environment Variables](#client-environment-variables)
4. [Development Setup](#development-setup)
   1. [Prerequisites](#prerequisites)
   2. [Install & Run](#install--run)
   3. [Build Scripts](#build-scripts)
5. [Operational Notes](#operational-notes)
   1. [Background Jobs & Queues](#background-jobs--queues)
   2. [Keep-Alive Pings](#keep-alive-pings)
6. [API Surface](#api-surface)
7. [Security & Secrets](#security--secrets)
8. [Troubleshooting](#troubleshooting)

## Architecture Overview

### Repository Layout

```
zecflow/
├── client/        # Vite + React frontend (demo UI & dashboard)
├── server/        # Express backend (workflows, NilAI/NilDB, jobs)
└── README.md
```

Both packages are independent Node projects with their own dependencies and scripts. The root directory intentionally contains no additional runtime dependencies.

### Server Architecture

* **Runtime:** Node 20+, Express 5, TypeScript compiled to CommonJS.
* **Persistence:** MongoDB via Mongoose (workflows, runs, submissions, datasets, connectors, jobs).
* **Queueing:** BullMQ (Redis) powers the run queue (`startRunWorker`) and scheduled jobs (`initializeTriggerSchedules`, `startCustomPollRunner`, `startTwitterPollRunner`).
* **Security:** JWT auth for dashboard APIs, Zod-based env validation, Helmet + configurable CORS.
* **Nillion Services:**
  * `@nillion/nilai-ts` for NilAI completions & attestations.
  * `@nillion/secretvaults` + `@nillion/nuc` for NilDB builder operations, delegation tokens, and user decrypt flows.
* **Structure:** `server/src/features` groups domain logic (auth, demo, workflows, runs, nillion-compute, etc.), while `server/src/config` hosts bootstrap code (env, Mongo, app). Entry point `src/main.ts` wires everything, starts the HTTP server, background workers, and keep-alive pings.

### Workflow Engine & Blocks

Workflows are stored collections of directed graphs (nodes + edges) that describe automation pipelines. Each node references a block implementation (NilAI step, NilDB store, connector call, logic op, etc.). The engine (`features/workflows/workflows.engine.ts`) loads the graph, topologically sorts nodes, and executes them:

1. **Inputs** capture initial payload fields (e.g., `stateKey`, `shieldResult`).
2. **Blocks** invoke handlers (NilAI inference, NilDB state store, connector HTTP call, math primitives). Batchable Nillion blocks can be executed together for efficiency.
3. **Outputs** collect node results for downstream consumers and are persisted on the run record.

Runs are created via API (builder dashboard, demo flows, or automation triggers). Each run is persisted (`RunModel`) and processed by the BullMQ worker, which executes the workflow engine and updates status (`pending → running → succeeded/failed`).

### Nillion Integrations

ZecFlow demonstrates multiple ways to interact with the Nillion network:

| Component | Purpose |
|-----------|---------|
| **NilAIService** (`features/nillion-compute/nilai.service.ts`) | Wraps NilAI OpenAI-compatible client, handles authentication tokens, retries, attestation fetch & compaction, and exposes helper methods (`runInference`, `generateStructured`). |
| **NilDBService** (`features/nillion-compute/nildb.service.ts`) | Manages the builder client, ensures collections exist, encrypts payloads, writes/reads documents, issues delegation tokens scoped to `/nil/db/data/read`, and provides helper functions (state storage, share storage). |
| **Demo endpoints** (`features/demo`) | Orchestrate high-level flows that combine NilAI completions with NilDB storage/shielding and delegation-token-based decrypt flows. |

Key flows:

* **Medical diagnosis demo:**
  1. User submits symptoms. Backend stores the input in NilDB (encrypted) and kicks off the workflow (`DEMO_MEDICAL_WORKFLOW_ID`).
  2. Workflow runs NilAI for diagnosis, stores the attested result in NilDB, and shields the payload (Blindfold).
  3. Client fetches attestation metadata via `/api/demo/medical-result`, and “Reveal diagnosis” calls the same endpoint to pull the plaintext extracted server-side via NilDB builder access.
* **Loan evaluation demo:** similar pipeline but focuses on NilCC execution and NilDB state references.

### Frontend Experience

The React app is split into two major surfaces:

1. **Demo page (`client/src/pages/demo.tsx`):** interactive medical/loan flows, attestation display, shielded result reveal, NilAI metadata, and run progression.
2. **Dashboard (`client/src/pages/dashboard`)**: builder-facing overview with stats, run success timelines, last runs (sourced from `/api/demo/runs` or authenticated `/api/runs`), workflow/trigger/connector navigation, and quick actions.

The UI uses Tailwind-like utility classes (via custom CSS), Lucide icons, Headless UI components, React Query for data fetching, and React Router for navigation. Nilion’s SecretVault user client is leveraged directly on the demo page when needed.

## Key Features

* **Workflow orchestration** with Nillion-aware blocks, storing state and outputs in NilDB.
* **NilAI attestation pipeline**: fetches, hashes, and surfaces CPU/GPU attestation (with optional raw report link) per run.
* **Shielded diagnosis UX**: results are stored encrypted by the builder and only revealed to the user via a backend decrypt helper.
* **Demo run aggregation**: public endpoint `/api/demo/runs` powers the dashboard even without auth, while `/api/runs` serves authenticated organizations.
* **Background jobs**: custom pollers, schedule runner, run worker, and keep-alive ping keep Render dynos active.

## Environment Configuration

### Server Environment Variables

Copy `server/.env.example` to `server/.env` and update the values:

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port for the Express server (default `4000`). |
| `NODE_ENV` | `development`, `test`, or `production`. |
| `MONGO_URI` | MongoDB connection string. |
| `PUBLIC_URL` | Base URL the server is reachable at (used for keep-alive pings). |
| `ENCRYPTION_KEY` | 32-byte hex string for field-level encryption. |
| `CORS_ORIGINS` | Comma-separated list of allowed Origins (omit to allow all). |
| `KEEP_ALIVE_INTERVAL_MS` | Optional interval (ms) for Render keep-alive pings (default 10 minutes). |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN` | Dashboard auth tokens. |
| `NILCC_*`, `NILDB_*`, `NILAI_*` | Credentials/endpoints for NilCC, NilDB, NilAI. |
| `ZCASH_*` | Zcash RPC endpoints and credentials if running Zcash blocks. |
| `QUEUE_REDIS_URL` | Redis URL for BullMQ. |
| `DEMO_LOAN_WORKFLOW_ID`, `DEMO_MEDICAL_WORKFLOW_ID` | IDs of the published demo workflows in Mongo. |

### Client Environment Variables

Copy `client/.env.example` to `client/.env`:

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL (including `/api`) for the backend. Example: `http://localhost:4000/api`. |

The client `.env` is ignored by Git; keep `.env.example` updated for others.

## Development Setup

### Prerequisites

* Node.js 20+
* npm 9+
* MongoDB (local or Atlas) and Redis (for queue processing)

### Install & Run

```bash
# Server
cd server
npm install
cp .env.example .env   # edit values
npm run dev             # starts Express with ts-node-dev

# Client
cd ../client
npm install
cp .env.example .env    # edit VITE_API_URL if needed
npm run dev             # starts Vite dev server on http://localhost:5173
```

The frontend proxies API calls to `VITE_API_URL`, so ensure the server is reachable there (default `http://localhost:4000/api`).

### Build Scripts

* `npm run build` (server) transpiles TypeScript to `dist/`.
* `npm run start` (server) runs the compiled bundle.
* `npm run build` (client) performs a type check and Vite production build (output in `client/dist`).
* `npm run preview` (client) serves the built assets locally.

## Operational Notes

### Background Jobs & Queues

* **BullMQ worker (`startRunWorker`)** pulls queued workflow runs and executes them via the engine.
* **Schedule runners** (`initializeTriggerSchedules`, `startCustomPollRunner`, `startTwitterPollRunner`) poll external sources and enqueue runs.
* **NilCC watcher** monitors compute workflows on the Nillion Compute Cluster (NilCC).

Redis must be reachable via `QUEUE_REDIS_URL` for these components to function.

### Keep-Alive Pings

Deployments on Render (or similar platforms) may idle after periods of inactivity. The server now performs periodic GET requests to `PUBLIC_URL` every `KEEP_ALIVE_INTERVAL_MS` milliseconds (default 10 minutes) to keep the instance warm. If your hosting platform does not require this, set a large interval or remove the variable.

## API Surface

The backend exposes a combination of authenticated and public routes. Highlights:

| Method | Path | Description |
|--------|------|-------------|
| `POST /api/demo/medicals` | Submits a medical diagnosis request, stores payload in NilDB, and kicks off the workflow. |
| `GET /api/demo/run-status/:runId` | Poll run progress for demo workflows. |
| `GET /api/demo/medical-result` | Fetch attestation metadata and decrypted diagnosis for a NilDB result key. |
| `GET /api/demo/medical-attestation` | Proxy NilAI attestation report. |
| `GET /api/demo/runs` | Latest runs for published demo workflows (powering the dashboard when unauthenticated). |
| `POST /api/demo/delegation` | Issue a delegation token (scoped to `/nil/db/data/read`) for user NilDB clients. |
| Authenticated CRUD routes | `/api/workflows`, `/api/triggers`, `/api/connectors`, `/api/runs`, etc., for builder dashboard management. |

Refer to `server/src/features/*/*.route.ts` for the complete list of routes and handlers.

## Security & Secrets

* **Environment files:** `server/.env` and `client/.env` are ignored by Git; only `.env.example` files are tracked. If sensitive values were previously committed, regenerate them and force-remove the old history if necessary.
* **Delegation tokens:** The backend never exposes raw NilDB delegation tokens in the UI; diagnosis reveals occur server-side via builder credentials.
* **CORS:** Restrict `CORS_ORIGINS` to your trusted frontend domains in production.
* **Encryption key:** Use a unique 32-byte hex string in `ENCRYPTION_KEY` to encrypt sensitive fields before NilDB writes.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Dashboard runs show `0% success` despite demo completions | Authenticated `/api/runs` response contains only failed runs; demo runs now stay as the fallback unless successful runs exist. If you still see `0%`, ensure `/api/demo/runs` is reachable and that the frontend can access it through `VITE_API_URL`. |
| Client requests fail with CORS errors | Verify `CORS_ORIGINS` includes the frontend origin (e.g., `http://localhost:5173`). |
| Render idles the server | Confirm `PUBLIC_URL` is set to the deployed base URL and optionally adjust `KEEP_ALIVE_INTERVAL_MS`. |
| NilAI attestation link returns 401 | Use the proxied `/api/demo/medical-attestation` link surfaced in the UI; the raw NilAI endpoint requires NilAuth credentials. |
| NilDB read 401 from the browser | The frontend no longer reads NilDB directly; if you forked older code, ensure delegation tokens target `/nil/db/data/read` and use the server helper instead. |

For deeper inspection, consult the server logs (Pino) and the BullMQ dashboard (if enabled) to trace workflow execution steps.
