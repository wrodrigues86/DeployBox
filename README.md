# DeployBox v1.0.0

Painel administrativo para hospedar multiplos projetos Node.js (API, App, Worker e Docker) em um unico servidor, com isolamento por projeto.

## Stack

- Backend: Node.js, Express, SQLite, better-sqlite3, node-cron, socket.io
- Frontend: React, TailwindCSS, Monaco Editor

## Estrutura

- `server/`: API principal + engine de execucao
- `client/`: painel admin
- `projects/<slug>/`: codigo, `.env`, `database.db`, `versions/` de cada projeto
- `database.db`: SQLite principal (admins, projects, logs, env, versions, dependencies)

## Executar

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Login inicial: `admin@nodepanel.local` / `admin123`

## Build para producao

```bash
npm run build
npm run start
```

Frontend buildado em `client/dist` e servido automaticamente pelo backend.

## APIs internas implementadas

- `POST /api/login`
- `GET/POST/PUT/DELETE /api/projects`
- `POST /api/projects/:id/run-now`
- `POST /api/projects/:id/restart`
- `POST /api/projects/:id/toggle`
- `POST /api/projects/:id/code`
- `GET/DELETE /api/projects/:id/logs`
- `GET /api/projects/:id/stats`
- `POST /api/projects/:id/sql/run`
- `GET /api/projects/:id/versions`
- `GET /api/projects/:id/versions/:versionId`
- `POST /api/projects/:id/restore/:versionId`
- `GET/POST /api/projects/:id/env`
- `DELETE /api/projects/:id/env/:key`
- `GET/POST /api/projects/:id/dependencies`

## Notas

- Runtime de projetos API via rota dinamica: `/:slug/*`.
- Webhook por projeto: `/:slug/webhook`.
- Logs live via Socket.IO (`project:join`, `project:log`).
- Workers suportam `cron`, `continuous` e `manual`.
