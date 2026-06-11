# Deployment Plan & Testing Strategy

This document details the strategies for validating, dockerizing, deploying, and scaling the World Cup 2026 simulator.

---

## 1. Testing Strategy

Our testing strategy covers three layers:

```
┌──────────────────────────────────────────────┐
│          Playwright E2E Tests                │  <- Validate UI, selections, and match playback
├──────────────────────────────────────────────┤
│          Vitest Backend Integration Tests    │  <- Validate Express REST endpoints and WS loops
├──────────────────────────────────────────────┤
│          Vitest Unit Tests (Math/Physics)    │  <- Validate physics, vectors, tactics, and groups
└──────────────────────────────────────────────┘
```

### A. Unit Testing (Vitest)
Unit tests in `/shared/src` validate pure mathematical and physical laws.
* Run tests: `npm run test -w shared`
* Covered items: vector addition/subtraction, boundary collisions, ELO standings updates, and starting lineup picker rules.

### B. End-to-End Testing (Playwright)
Playwright E2E tests automate the browser to click through:
1. Select two teams (e.g., Argentina vs France).
2. Adjust tactics and click "Kick Off".
3. Check scoreboard visibility.
4. Launch Tournament Mode and simulate the Group stage.

Example configuration `/frontend/playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
```

---

## 2. Deployment Plan

For production, the platform is dockerized and distributed as a microservices stack.

```mermaid
graph TD
    User[Web Client] -->|HTTPS / WSS| Nginx[NGINX Reverse Proxy]
    Nginx -->|Port 3000| Web[React Frontend Static Server]
    Nginx -->|Port 5000| API[Node.js Backend Instances]
    API -->|Read/Write| DB[(PostgreSQL Master)]
    API -->|Session Cache| Redis[(Redis Cache Cluster)]
    Cron[ETL Ingest Worker] -->|Updates ratings| DB
```

### Docker Compose Stack (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: wc26_postgres
    environment:
      POSTGRES_USER: simulator
      POSTGRES_PASSWORD: secret_db_password
      POSTGRES_DB: worldcup2026
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U simulator -d worldcup2026"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: wc26_redis
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: wc26_backend
    environment:
      PORT: 5000
      DATABASE_URL: postgresql://simulator:secret_db_password@postgres:5432/worldcup2026
      REDIS_URL: redis://redis:6379
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    container_name: wc26_frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
  redisdata:
```

### ETL Scheduling (Cron / Kubernetes CronJob)
The data ingestion pipeline script `/data-pipeline/dist/ingest.js` runs as a daily automated task to update Elo ratings:
```bash
0 2 * * * cd /app/data-pipeline && npm run ingest
```
This triggers at 02:00 AM server time, scraping `eloratings.net`, parsing StatsBomb metrics, and committing changes directly to the PostgreSQL database.
