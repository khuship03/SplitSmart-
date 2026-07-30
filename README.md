# SplitSmart

A Splitwise-style group expense sharing platform: real-time bill splitting, debt tracking,
bank transaction imports via Plaid, and AI-assisted expense categorization/insights via OpenAI.

## Stack

- **Frontend**: React + Vite + TypeScript (`/client`)
- **Backend**: Node.js + Express + TypeScript + Prisma (`/server`)
- **Database**: PostgreSQL
- **Cache**: Redis (group balance caching)
- **Bank data**: Plaid API (Sandbox)
- **AI**: OpenAI API (gpt-4o-mini) for auto-categorization + spending insights
- **Deploy**: AWS EC2 (free tier)

## Cost strategy (free tier as far as possible)

| Piece | Local dev | "Deployed" demo |
|---|---|---|
| Postgres | Docker Compose, free | Docker on the same EC2 box (avoids RDS cost) |
| Redis | Docker Compose, free | Docker on the same EC2 box (avoids ElastiCache cost) |
| Plaid | Sandbox mode, free forever, fake bank data | Sandbox mode |
| OpenAI | gpt-4o-mini pay-as-you-go | same — usage at this scale is cents, not dollars |
| AWS EC2 | n/a | free tier: t2.micro/t3.micro, 750 hrs/month for 12 months |

## Local setup

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Configure env
cp .env.example server/.env
# fill in JWT_SECRET, and later PLAID_*/OPENAI_API_KEY when we reach those phases

# 3. Backend
cd server
npm install
npm run prisma:migrate   # once schema exists (Phase 2)
npm run dev              # http://localhost:4000

# 4. Frontend (separate terminal)
cd client
npm install
npm run dev               # http://localhost:5173
```

## Project status

Being built incrementally, phase by phase:

- [x] Phase 1 — repo scaffold, Docker Compose, env config
- [x] Phase 2 — Prisma schema + JWT auth
- [x] Phase 3 — groups, expenses, splitting, debt-simplification
- [x] Phase 4 — React frontend
- [ ] Phase 5 — Redis caching layer
- [ ] Phase 6 — Plaid Sandbox integration
- [ ] Phase 7 — OpenAI categorization + insights
- [ ] Phase 8 — deploy to AWS EC2 free tier
