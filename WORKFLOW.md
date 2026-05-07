# End-to-End Workflow Guide

This document explains the complete workflow of the AI Task Processing Platform from user login to task execution and production deployment.

## 1) High-level architecture

The platform has five runtime components:

- Frontend (React): user UI for auth, task creation, task tracking.
- Backend API (Node.js + Express): auth, task CRUD, queue producer.
- MongoDB: persistent storage for users and tasks.
- Redis: queue broker for asynchronous processing.
- Python Worker: queue consumer that processes tasks and writes results.

Deployment/orchestration components:

- Docker + docker-compose for local multi-service execution.
- Kubernetes manifests for production-like orchestration.
- Argo CD for GitOps continuous deployment from infra repo.
- GitHub Actions for CI/CD image build + infra tag updates.

---

## 2) Application runtime workflow

### Step A: User registration/login

1. User opens frontend and submits register or login form.
2. Frontend sends request using Axios to backend:
   - `POST /api/auth/register`
   - `POST /api/auth/login`
3. Backend validates credentials:
   - Passwords hashed/verified using bcrypt.
   - JWT token generated on success.
4. Frontend stores JWT (currently in localStorage in this scaffold) and uses it in Authorization header for protected APIs.

### Step B: Create a task

1. Authenticated user submits task form with:
   - `title`
   - `input`
   - `operation` (`uppercase`, `lowercase`, `reverse`, `wordcount`)
2. Frontend calls `POST /api/tasks` with Bearer token.
3. Backend:
   - Validates auth via JWT middleware.
   - Creates Mongo task with `status = pending` and initial logs.
   - Pushes job payload (`taskId`, `userId`) into Redis queue.
4. Backend returns created task immediately (async pattern, no blocking on processing).

### Step C: Background processing

1. Python worker continuously consumes jobs from Redis (`BLPOP`).
2. For each job:
   - Loads task from Mongo.
   - Updates status `pending -> running`.
   - Executes selected operation.
   - On success: sets `status = success`, writes `result`, appends logs.
   - On failure: retries with backoff; after max retries sets `status = failed` and logs error.

### Step D: Status tracking in UI

1. Dashboard and Task Details pages poll backend periodically:
   - `GET /api/tasks`
   - `GET /api/tasks/:id`
2. User sees state transitions:
   - `pending` -> `running` -> `success` or `failed`
3. Task details shows logs and final result.

---

## 3) Security workflow

Backend protections applied on each request:

- `helmet` for HTTP security headers.
- `express-rate-limit` on API routes.
- JWT auth middleware for protected task routes.
- Password hashing with bcrypt.
- Environment variables for secrets (no hardcoded credentials).

Health checks:

- Backend: `GET /api/health`
- Frontend container: `/health`
- Worker: probe script validates Redis and Mongo connectivity.

---

## 4) Local development workflow (Docker Compose)

1. Copy `.env.example` files to real `.env` files.
2. Run:

```bash
docker compose up --build
```

3. Compose starts:
   - `mongodb`
   - `redis`
   - `backend`
   - `worker`
   - `frontend`

4. You test full flow:
   - Register/login
   - Create task
   - Watch status update as worker processes queue

This gives a production-like distributed environment on your machine.

---

## 5) Kubernetes workflow

### Namespace and shared config

1. Create namespace: `ai-task-platform`.
2. Apply ConfigMap for non-secret env values.
3. Apply Secret for sensitive values (`JWT_SECRET`, `MONGODB_URI`, etc.).

### Core services

Deployments + Services for:

- `frontend`
- `backend`
- `worker` (multiple replicas supported)
- `mongodb`
- `redis`

Each deployment includes:

- resource requests/limits
- liveness/readiness probes

Ingress routes external traffic:

- `/api` -> backend service
- `/` -> frontend service

### Scaling

Worker deployment is horizontally scalable; multiple worker pods consume from same Redis queue concurrently to increase throughput.

---

## 6) CI/CD workflow (GitHub Actions)

Separate workflows for frontend/backend/worker:

1. Trigger on changes in service folder.
2. Run quality/build steps:
   - lint/build (Node services)
   - compile check (Python worker)
3. Build Docker image.
4. Push image to Docker Hub tagged with commit SHA.
5. Auto-update image tag in infra repository manifests.

Result: every successful code change produces a deployable immutable image and updates desired infra state.

---

## 7) GitOps workflow with Argo CD

1. Infra repo stores Kubernetes manifests as source of truth.
2. Argo CD `Application` watches infra repo path.
3. When CI updates image tags in infra repo:
   - Argo CD detects change
   - Auto-sync applies changes to cluster
   - Self-heal/prune maintains desired state

This gives auditable, declarative, rollback-friendly deployment.

---

## 8) Throughput strategy for high scale (e.g., 100k tasks/day)

- Keep API stateless and scale backend replicas.
- Scale worker replicas based on queue depth and CPU.
- Use Mongo indexes on:
  - `userId + createdAt`
  - `status`
- Add dead-letter queue and delayed retries for poisoned/transient jobs.
- Prefer managed Redis/Mongo in production for HA and backups.

---

## 9) Recommended study order

Read in this sequence:

1. `README.md` (quick setup and project map)
2. `architecture.md` (design intent)
3. This file (`WORKFLOW.md`) for end-to-end behavior
4. Backend routes/controllers/models
5. Worker processing loop
6. Kubernetes + Argo CD manifests
7. GitHub Actions workflows

---

## 10) Quick trace example (one task)

1. User submits "reverse" task via frontend.
2. Backend saves task as `pending` in Mongo.
3. Backend pushes `{taskId}` to Redis list.
4. Worker pops job, sets `running`, computes reverse string.
5. Worker writes `success + result + logs`.
6. Frontend polling fetches updated task and displays result.

This is the core asynchronous workflow pattern used by the platform.
