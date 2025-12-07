# ZecFlow

ZecFlow is a privacy-preserving automation platform for building workflows that combine Zcash shielded transactions with Nillion blind compute. Data stays encrypted from input to output—the platform orchestrates execution without accessing the underlying values and provides cryptographic attestations after each run to prove correct execution.

We built two demo workflows using ZecFlow: a private medical diagnosis system and a confidential loan evaluation pipeline. Both use Nillion blind compute blocks to process sensitive data without exposing it.

Try them here: **https://zecflow.vercel.app/demo**

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [The Privacy Stack](#the-privacy-stack)
   - [Nillion Blind Compute](#nillion-blind-compute)
   - [Zcash Shielded Transfers](#zcash-shielded-transfers)
   - [Input, Transform, and Action Blocks](#input-transform-and-action-blocks)
3. [Triggers](#triggers)
4. [Datasets](#datasets)
5. [Connectors](#connectors)
6. [Integration After Publish](#integration-after-publish)
7. [Project Structure](#project-structure)
8. [Getting Started](#getting-started)
9. [Environment Variables](#environment-variables)
10. [API Endpoints](#api-endpoints)

## Core Concepts

A workflow in ZecFlow consists of:

- **Trigger**: The event that starts the workflow (webhook, Zcash transaction, schedule, etc.)
- **Dataset**: Defines the input schema and provisions a NilDB collection for encrypted storage
- **Blocks**: The processing steps that transform, compute, and act on data
- **Connectors**: External service configurations (APIs, Zcash nodes) used by triggers and blocks

When a workflow runs:
1. The trigger fires with a payload
2. Blocks execute in sequence based on the workflow graph
3. Each block reads from memory (previous outputs) and writes results back
4. Final outputs can settle on Zcash or call external services

## The Privacy Stack

### Nillion Blind Compute

Nillion provides three components for private computation:

**NilDB (Blind State Storage)**

Encrypted key-value storage where data is never decrypted on the server. ZecFlow uses NilDB to store workflow inputs, intermediate state, and results.

| Block | Purpose |
|-------|---------|
| `state-store` | Write encrypted data to a NilDB collection. Supports field-level encryption with configurable keys. |
| `state-read` | Read encrypted data back using a state key. Returns decrypted values to the workflow memory. |

**NilAI (Private Reasoning)**

Large language model inference that operates on encrypted references. The model receives aliases pointing to NilDB records instead of raw data.

| Block | Purpose |
|-------|---------|
| `nilai-llm` | Run LLM inference with a prompt template. Variables in the template reference encrypted NilDB aliases. Returns text output with optional attestation. |

**NilCC (Blind Compute Cluster)**

Execute arbitrary computations on encrypted inputs inside a trusted execution environment. Results include cryptographic attestations proving correct execution.

| Block | Purpose |
|-------|---------|
| `nillion-compute` | Execute a registered NilCC workload with secret inputs. Returns computed result and attestation. |
| `nillion-block-graph` | Run a visual graph of Nillion compute blocks (math, logic, comparison) inside TEE. |

**Math Blocks** (executed via NilCC):

| Block | Operation |
|-------|-----------|
| `math-add` | Add two numbers |
| `math-subtract` | Subtract second from first |
| `math-multiply` | Multiply two numbers |
| `math-divide` | Divide first by second |
| `math-greater-than` | Return true if a > b |

**Logic Blocks**:

| Block | Operation |
|-------|-----------|
| `logic-if-else` | Return one of two values based on a boolean condition |

### Zcash Shielded Transfers

Zcash provides the settlement layer. Shielded transactions keep sender, receiver, and amount private on-chain while still allowing structured data in encrypted memos.

| Block | Purpose |
|-------|---------|
| `zcash-send` | Send ZEC from a shielded address. Supports configurable privacy policy, memo content, and amount from workflow data. |
| `memo-parser` | Parse a Zcash memo string into key-value pairs using a delimiter. Useful for extracting structured data from incoming transactions. |

The `zcash-send` block supports these privacy policies:
- `FullPrivacy` - Default. All transaction details are shielded.
- `AllowRevealedAmounts` - Amount visible, addresses hidden.
- `AllowRevealedRecipients` - Recipient visible, sender and amount hidden.
- `AllowRevealedSenders` - Sender visible, recipient and amount hidden.
- `NoPrivacy` - Fully transparent transaction.

### Input, Transform, and Action Blocks

These blocks handle data extraction and external calls:

| Block | Category | Purpose |
|-------|----------|---------|
| `payload-input` | Input | Extract the trigger payload or a nested path from it. |
| `json-extract` | Transform | Pull a specific value from payload or memory and store it under an alias. |
| `connector-request` | Action | Call a REST endpoint through a configured connector. |
| `custom-http-action` | Action | Call any HTTP endpoint with method, headers, and body from workflow data. |

## Triggers

Triggers define what starts a workflow. Each trigger type has specific configuration options.

| Trigger | Category | Description | Config Options |
|---------|----------|-------------|----------------|
| `http-webhook` | Webhook | Fire when an HTTP POST hits the webhook URL | `path`, `secret` (optional HMAC validation) |
| `zcash-transaction` | Blockchain | Fire when a shielded transaction matches criteria | `address`, `memoPattern`, `minAmount`, `minConfirmations` |
| `schedule` | Schedule | Fire on a cron schedule | `expression` (cron syntax) |
| `twitter-post` | Social | Fire when a Twitter account posts or is mentioned | `handle`, `filter`, `eventType`, `pollIntervalSec` |
| `github-commit` | Code | Fire when commits land on a branch | `branch`, `includePaths`, `excludePaths` |
| `custom-http-poll` | Data | Periodically poll an HTTP endpoint for new records | `relativePath`, `method`, `pollIntervalSec`, `recordsPath` |

**Zcash Transaction Trigger**

The Zcash watcher polls for incoming shielded transactions every 30 seconds. When a transaction matches the configured criteria (address, memo pattern, minimum amount), it creates a workflow run with the transaction data as payload:

```json
{
  "txid": "abc123...",
  "amount": 1.5,
  "memo": "ORDER:12345",
  "address": "zs1...",
  "confirmations": 3,
  "blockheight": 2000000
}
```

## Datasets

A dataset defines the schema for workflow inputs and provisions a NilDB collection for encrypted storage.

When you create a dataset:
1. You specify a JSON schema describing the expected fields and types
2. ZecFlow generates a unique collection ID
3. A NilDB collection is created with the schema

When you link a dataset to a workflow:
- The dataset schema defines what fields the workflow expects
- Input data is stored encrypted in the NilDB collection
- Blocks can reference this data using state keys

Example dataset schema:
```json
{
  "type": "object",
  "properties": {
    "fullName": { "type": "string" },
    "income": { "type": "number" },
    "requestedAmount": { "type": "number" },
    "country": { "type": "string" }
  },
  "required": ["fullName", "income", "requestedAmount"]
}
```

This schema:
- Creates form fields for the integration snippet
- Validates incoming data
- Determines which fields get encrypted in NilDB

## Connectors

Connectors store external service configurations. They keep credentials encrypted and provide reusable connections for triggers and blocks.

Types of connectors:
- **HTTP API**: Base URL, authentication headers, API keys
- **Zcash Node**: RPC endpoint, viewing keys, rescan settings

Connectors are referenced by:
- `custom-http-poll` triggers (to poll external APIs)
- `connector-request` blocks (to call APIs during workflow execution)
- `zcash-transaction` triggers (to watch specific addresses with viewing keys)

## Integration After Publish

When you publish a workflow that has a dataset, ZecFlow generates a React integration snippet. This snippet provides a ready-to-use form component that:

1. Renders input fields based on the dataset schema
2. Connects to the Nillion SecretVault client
3. Requests a delegation token from ZecFlow
4. Stores user data encrypted in NilDB with proper access control
5. Submits the state key to trigger the workflow

Example generated snippet structure:

```tsx
import { useState } from 'react';
import type { SecretVaultUserClient } from '@nillion/secretvaults';

const BUILDER_DID = 'did:nil:builder123...';
const COLLECTION_ID = 'col_abc123...';
const ZECFLOW_API_URL = 'https://zecflow.onrender.com';

export function ZecflowWorkflowForm({ nillionClient, ownerDid }) {
  const [values, setValues] = useState({
    fullName: '',
    income: '',
    requestedAmount: '',
  });

  async function handleSubmit(e) {
    e.preventDefault();
    
    // 1. Get delegation token from ZecFlow
    const delegationRes = await fetch(ZECFLOW_API_URL + '/api/delegation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: ownerDid, collectionId: COLLECTION_ID }),
    });
    const { token } = await delegationRes.json();

    // 2. Store data encrypted in NilDB
    const createResponse = await nillionClient.createData(
      {
        owner: ownerDid,
        collection: COLLECTION_ID,
        data: [{ fullName: values.fullName, income: Number(values.income), ... }],
        acl: { grantee: BUILDER_DID, read: true, write: false, execute: true },
      },
      { auth: { delegation: token } },
    );

    // 3. Submit state key to trigger workflow
    const documentId = createResponse[...].data.created[0];
    const stateKey = COLLECTION_ID + ':' + documentId;
    await fetch('https://your-inbox-endpoint.com', {
      method: 'POST',
      body: JSON.stringify({ stateKey }),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Generated form fields */}
    </form>
  );
}
```

The workflow then:
1. Receives the state key via its trigger
2. Uses `state-read` blocks to access the encrypted data
3. Processes with Nillion compute blocks
4. Outputs results or settles on Zcash

## Project Structure

```
zecflow/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── landing/       # Landing page sections
│   │   │   ├── demo/          # Demo UI components
│   │   │   └── dashboard/     # Builder dashboard components
│   │   ├── pages/
│   │   │   ├── landing-page.tsx
│   │   │   ├── demo.tsx       # Interactive demos
│   │   │   └── dashboard/     # Workflow builder UI
│   │   ├── context/           # Nillion user context
│   │   └── services/          # API client
│   └── ...
├── server/                    # Express backend
│   ├── src/
│   │   ├── features/
│   │   │   ├── auth/          # JWT authentication
│   │   │   ├── blocks/        # Block registry and handlers
│   │   │   ├── connectors/    # External service configs
│   │   │   ├── datasets/      # Input schemas and NilDB provisioning
│   │   │   ├── demo/          # Public demo endpoints
│   │   │   ├── nillion-compute/
│   │   │   │   ├── nilai.service.ts   # NilAI client
│   │   │   │   ├── nildb.service.ts   # NilDB operations
│   │   │   │   └── nilcc.service.ts   # NilCC execution
│   │   │   ├── runs/          # Workflow execution records
│   │   │   ├── triggers/      # Trigger registry and handlers
│   │   │   ├── workflows/     # Workflow engine
│   │   │   └── zcash-execution/
│   │   │       ├── zcash-watcher.ts   # Transaction polling
│   │   │       └── ...
│   │   ├── queues/            # BullMQ job processors
│   │   └── shared/
│   │       └── services/
│   │           └── zcash.service.ts   # Zcash RPC client
│   └── ...
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB
- Redis
- Zcash node (optional, for shielded transfers)

### Installation

```bash
git clone https://github.com/chigozzdevv/zecflow.git
cd zecflow

# Server
cd server
npm install
cp .env.example .env  # Configure environment variables

# Client
cd ../client
npm install
cp .env.example .env  # Set VITE_API_URL
```

### Running

```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm run dev
```

Server runs on `http://localhost:4000`, client on `http://localhost:5173`.

## Environment Variables

### Server

| Variable | Description | Required / Default |
|----------|-------------|--------------------|
| `NODE_ENV` | Node environment flag | default `development` |
| `PORT` | HTTP port | default `4000` |
| `PUBLIC_URL` | Public base URL used for keep-alive pings | **required** |
| `KEEP_ALIVE_INTERVAL_MS` | Interval for keep-alive ping | optional (defaults to 10m in code if unset) |
| `MONGO_URI` | MongoDB connection string | **required** |
| `QUEUE_REDIS_URL` | Redis URL for BullMQ workers | optional (`redis://127.0.0.1:6379` fallback) |
| `JWT_SECRET` | Access token signing secret | **required** |
| `JWT_EXPIRES_IN` | Access token TTL | default `1d` |
| `REFRESH_TOKEN_SECRET` | Refresh token signing secret | **required** |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token TTL | default `7d` |
| `ENCRYPTION_KEY` | Symmetric key for field encryption (32-byte recommended) | **required** |
| `CORS_ORIGINS` | Comma-separated allowed origins | optional |
| `NILDB_ENABLED` | Toggle NilDB integration | default `true` |
| `NILDB_NODES` | Comma-separated NilDB node URLs | default `https://nildb-stg-n1.nillion.network,https://nildb-stg-n2.nillion.network,https://nildb-stg-n3.nillion.network` |
| `NILLION_API_KEY` | Nillion API key for NilDB/NilAI | optional |
| `NILCHAIN_URL` | Nilchain RPC URL | default `http://rpc.testnet.nilchain-rpc-proxy.nilogy.xyz` |
| `NILAUTH_URL` | Nilauth URL | default `https://nilauth.sandbox.app-cluster.sandbox.nilogy.xyz` |
| `NILAI_API_KEY` | NilAI API key | optional |
| `NILAI_BASE_URL` | NilAI base URL | default `https://nilai-a779.nillion.network/v1` |
| `NILAI_NILAUTH_INSTANCE` | NilAI auth instance (`sandbox`\|`production`) | default `sandbox` |
| `NILCC_API_KEY` | NilCC API key | optional |
| `NILCC_BASE_URL` | NilCC base URL | default `https://api.nilcc.nillion.network` |
| `NILCC_POLL_TIMEOUT_MS` | NilCC poll timeout | optional |
| `NILCC_POLL_INTERVAL_MS` | NilCC poll interval | optional |
| `ZCASH_RPC_URL` | Zcash node RPC endpoint | **required** |
| `ZCASH_RPC_USER` | Zcash RPC username | optional |
| `ZCASH_RPC_PASSWORD` | Zcash RPC password | optional |
| `ZCASH_DEFAULT_FROM_ADDRESS` | Default shielded address for sends | optional |
| `ZCASH_DEFAULT_PRIVACY_POLICY` | Default privacy policy enum | optional |
| `ZCASH_OPERATION_TIMEOUT_MS` | Zcash RPC timeout (ms) | default `120000` |

### Client

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL (e.g., `http://localhost:4000/api`) |

## API Endpoints

### Public (Demo)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/demo/medicals` | Submit medical diagnosis request |
| POST | `/api/demo/loan-app` | Submit loan application |
| GET | `/api/demo/run-status/:runId` | Get workflow run status |
| GET | `/api/demo/runs` | List recent demo runs |
| GET | `/api/demo/medical-result` | Get diagnosis result and attestation |
| POST | `/api/demo/delegation` | Get NilDB delegation token |

### Authenticated (Dashboard)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows` | Create workflow |
| POST | `/api/workflows/:id/publish` | Publish workflow, get integration snippet |
| GET | `/api/workflows/:id/snippet` | Get integration snippet |
| GET | `/api/datasets` | List datasets |
| POST | `/api/datasets` | Create dataset (provisions NilDB collection) |
| GET | `/api/triggers` | List triggers |
| POST | `/api/triggers` | Create trigger |
| GET | `/api/connectors` | List connectors |
| POST | `/api/connectors` | Create connector |
| GET | `/api/runs` | List workflow runs |
