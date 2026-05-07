# AI Task Processing Platform — Architecture Document

> MERN + Python Worker · Docker · Kubernetes · Argo CD · CI/CD

---

## 1. System Architecture

The platform is a five-service distributed system. Each service runs in its own container, communicates over a private Docker/Kubernetes network, and has a single clearly defined responsibility.

| Service | Responsibility |
|---|---|
| Frontend (React + Vite) | Auth UI, task creation, status polling, result display |
| Backend API (Express) | JWT auth, task CRUD, job enqueue to Redis |
| MongoDB | Persistent store for users and task records |
| Redis | In-memory job queue (RPUSH / BLPOP) |
| Python Worker | Background job consumer — executes operations, writes results |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / CLIENT                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS (Ingress / nginx)
┌──────────────────────────▼──────────────────────────────────────┐
│               FRONTEND  (React + Vite, nginx:alpine)            │
│               Kubernetes: 2 replicas                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │  /api/* → backend:4000
┌──────────────────────────▼──────────────────────────────────────┐
│               BACKEND API  (Node.js + Express)                  │
│               Kubernetes: 2 replicas                            │
│   auth routes │ task routes │ health route                      │
└──────┬────────────────────────────────┬───────────────────────--┘
       │  mongoose                      │  ioredis RPUSH
┌──────▼──────────┐           ┌─────────▼─────────┐
│    MONGODB      │           │      REDIS         │
│   (persistent)  │           │   task_queue list  │
│   users, tasks  │           │                    │
└──────▲──────────┘           └─────────┬──────────┘
       │  pymongo update                │  BLPOP (blocking pop)
┌──────┴────────────────────────────────▼───────────────────────--┐
│               PYTHON WORKER                                      │
│               Kubernetes: 3 replicas (scalable)                  │
│   pending → running → success | failed                           │
└──────────────────────────────────────────────────────────────────┘
```

### Request / Processing Sequence

```
User        Frontend       Backend        Redis        Worker         MongoDB
 │              │              │              │             │              │
 │─POST /tasks─▶│              │              │             │              │
 │              │─POST /tasks─▶│              │             │              │
 │              │              │─Task.create()────────────────────────────▶│
 │              │              │              │             │  {status:pending}
 │              │              │─RPUSH───────▶│             │              │
 │              │              │   {taskId}   │             │              │
 │              │◀──201 task───│              │             │              │
 │◀─task card───│              │              │             │              │
 │              │              │              │◀─BLPOP──────│              │
 │              │              │              │  (blocks)   │              │
 │              │              │              │──{taskId}──▶│              │
 │              │              │              │             │─findOne()───▶│
 │              │              │              │             │◀──task───────│
 │              │              │              │             │─status=running▶
 │              │              │              │             │  process op() │
 │              │              │              │             │─status=success▶
 │              │              │              │             │  result+logs  │
 │──GET /tasks/:id (polling)──▶│              │             │              │
 │◀──updated task─────────────◀│              │             │              │
```

---

## 2. Worker Scaling Strategy

The worker is intentionally stateless — it holds no local state between jobs. Every job is loaded fresh from MongoDB. This is the key design decision that makes horizontal scaling trivial.

### How Multiple Replicas Work Safely

Redis BLPOP is atomic. When multiple worker replicas all call `BLPOP` on the same list simultaneously, Redis pops exactly one item and delivers it to exactly one caller. No job is ever processed twice.

With 3 worker replicas running (as configured in `worker.yaml`):

- All 3 pods call `BLPOP("task_queue", timeout=5)` concurrently
- Redis delivers each job to whichever worker is next — round-robin effectively
- Each worker independently updates its job's status in MongoDB
- If one worker pod crashes mid-job, the job stays as `status=running`. A reconciliation job can re-queue tasks stuck in running for more than N minutes

### Scaling Triggers

| Method | When to Use | Config |
|---|---|---|
| Manual replica increase | Predictable traffic spikes | `kubectl scale deployment/worker --replicas=10` |
| HPA (CPU-based) | Worker is CPU-bound | `targetCPUUtilizationPercentage: 70` |
| KEDA (queue-depth) | Scale based on Redis queue depth — most accurate | `triggerType: redis, listLength threshold: 50` |

> For this project: `worker.yaml` sets `replicas: 3` which provides 3x parallelism with zero coordination overhead. KEDA would be the production choice.

---

## 3. Handling 100,000 Tasks / Day

### Throughput Calculation

```
100,000 tasks/day
÷ 86,400 seconds/day
= 1.16 tasks/second  (average)

Assume 10x burst factor (common for web workloads)
= 11.6 tasks/second  (peak)

Each worker can process ~5 simple tasks/sec (string ops are fast)
3 worker replicas  =  ~15 tasks/sec capacity

Headroom: 15 / 11.6 = 1.3x  →  comfortable but worth monitoring
At 10 replicas: 50 tasks/sec  →  handles 4.3M tasks/day
```

### Bottleneck Analysis

| Layer | Bottleneck Risk | Mitigation |
|---|---|---|
| Redis queue | Low — Redis handles 100k+ ops/sec | Use persistence (`appendonly yes`) to survive restarts |
| MongoDB writes | Medium — 2-3 writes per job | Connection pooling, compound indexes, batch log writes |
| Backend API | Low — stateless, horizontally scalable | Scale Deployment replicas |
| Worker CPU | Low for string ops | Add replicas, use KEDA autoscaling on queue depth |

### Additional Strategies at Scale

- **Pagination** — add `limit/skip` query params to `GET /api/tasks` before production
- **Dead-letter queue** — after `MAX_RETRIES`, push failed payload to `task_queue_failed` for replay
- **Task TTL** — add MongoDB TTL index on `completedAt` to auto-delete old tasks
- **Managed services** — use MongoDB Atlas and Redis Cloud for HA, backups, and connection pooling

---

## 4. Database Indexing Strategy

The Task model defines these indexes (see `Task.js`):

```javascript
// Single field — fast status-based queries (worker DB-poll fallback)
taskSchema.index({ status: 1 });

// Single field — userId foreign key lookups
taskSchema.index({ userId: 1 });

// Compound — covers the most common dashboard query:
// "get all tasks for this user, newest first"
taskSchema.index({ userId: 1, createdAt: -1 });
```

| Index | Query it Covers | Why it Matters |
|---|---|---|
| `{ status: 1 }` | Worker DB-poll fallback: find pending tasks | Without this, worker scans entire collection on every poll |
| `{ userId: 1 }` | Auth check — does this task belong to this user? | Every `GET /tasks/:id` query hits this |
| `{ userId: 1, createdAt: -1 }` | Dashboard — all tasks for user, newest first | Covers both filter and sort in one index scan, no in-memory sort needed |
| `{ email: 1 }` on User | Login — find user by email | Without index, every login is a full collection scan |

> The compound index `{ userId: 1, createdAt: -1 }` is the most important. MongoDB can use the `userId` prefix alone as an equality filter, so it also serves as the `{ userId: 1 }` index — two queries covered for the price of one.

---

## 5. Redis Failure Handling

Redis is the queue broker. If it becomes unavailable, new tasks cannot be enqueued and the worker cannot consume. The system handles this at two levels:

### Worker Side (`worker.py`)

The worker's `run_worker()` loop catches `RedisError` specifically:

```python
except RedisError:
    logging.exception("Redis error encountered. Retrying in 2 seconds")
    time.sleep(2)
    # Loop continues — next iteration calls BLPOP again
    # Worker does NOT crash
```

- The worker never exits on a Redis error — it logs, waits 2 seconds, and retries
- `ioredis` (backend) also reconnects automatically — `maxRetriesPerRequest: null` means it keeps trying indefinitely
- Tasks already popped from Redis before the failure are processed to completion — not lost
- Tasks not yet popped remain in the Redis list and are processed in order when Redis recovers

### Backend Side (`queue.service.js`)

If Redis is down when a user creates a task, the task is saved to MongoDB with `status=pending` but never queued. A reconciliation job can fix this:

```javascript
// Runs every 5 minutes — re-queues tasks stuck as pending
const stalePending = await Task.find({
    status: "pending",
    createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
});
for (const task of stalePending) {
    await redis.rpush(QUEUE_KEY, JSON.stringify({ taskId: task._id }));
}
```

### Production Recommendation

- Use **Redis Sentinel** (1 primary + 2 replicas + 3 sentinels) for automatic failover
- Enable `appendonly yes` so the queue survives pod restarts
- Use a managed Redis service (Redis Cloud, AWS ElastiCache) in production
- Set `maxmemory-policy: noeviction` so Redis never silently drops queue items under memory pressure

---

## 6. CI/CD and GitOps Flow

```
Developer pushes code
     │
     ▼
GitHub Actions triggers (path-based — only runs for changed service)
     │
     ├── npm ci + eslint (lint check)
     ├── vite build (frontend only)
     ├── docker build (multi-stage)
     └── docker push → DockerHub tagged with :${GITHUB_SHA}
     │
     ▼
CI clones infra repo and updates image tag:
  sed -i "s|ai-task-backend:.*|ai-task-backend:${GITHUB_SHA}|" k8s/backend.yaml
  git commit + git push
     │
     ▼
Argo CD detects infra repo change (polls every 3 minutes)
     │
     ├── automated: prune: true    → removes old resources
     ├── automated: selfHeal: true → corrects manual drift
     └── applies updated Deployment → Kubernetes rolling update
     │
     ▼
New pods start, old pods drain → zero-downtime rollout
```

> Each Docker image is tagged with the exact Git commit SHA. This makes every deployment fully traceable — you can look at a running pod's image tag and find the exact commit that produced it.

---

> **Note:** Infrastructure manifests are located in the `/infra` directory of this repository.
> In a production setup this would be a separate repository for GitOps separation of concerns.