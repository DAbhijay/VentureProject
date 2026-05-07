# AI Task Processing Platform Architecture

## System architecture
- Frontend (React + Vite) handles registration, login, and task lifecycle screens.
- Backend (Express + MongoDB) stores users/tasks and enqueues jobs to Redis.
- Python worker consumes jobs asynchronously via Redis BLPOP and writes execution status/results into MongoDB.
- Redis buffers API write throughput from worker compute throughput.

## Worker scaling strategy
- Worker is stateless and horizontally scalable; replicas consume from one queue.
- Scale worker replicas using HPA plus queue depth metrics.

## Handling 100k tasks/day
- Baseline throughput ~1.16 tasks/sec, provision for burst x10.
- Keep backend replicas and worker autoscaling with retries and dead-letter strategy.

## Database indexing strategy
- Index tasks on userId+createdAt and status.
- Keep users email unique index for auth.

## Redis failure handling
- Worker retries on Redis errors with backoff.
- For production use managed Redis/Sentinel and enable persistence.

## CI/CD flow
- Service workflows lint and build.
- Push Docker images tagged by commit SHA.
- Update infra repository image tags automatically.

## GitOps flow with Argo CD
- Argo CD watches infra repo path and auto-syncs changes.
- Prune and self-heal enforce desired state.
