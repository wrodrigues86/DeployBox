import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import cron from 'node-cron';
import { exec, execFile } from 'node:child_process';
import Database from 'better-sqlite3';
import { db, nowIso } from './database.js';
import { addLog } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const projectsRoot = path.join(rootDir, 'projects');
const PROJECT_DIR_MODE_RAW = String(process.env.PROJECT_DIR_MODE || '0777').trim();
const PROJECT_DIR_MODE = /^[0-7]{3,4}$/.test(PROJECT_DIR_MODE_RAW)
  ? Number.parseInt(PROJECT_DIR_MODE_RAW.slice(-3), 8)
  : 0o777;
const runtime = {
  workers: new Map(),
  apiCache: new Map(),
  rateMap: new Map(),
};

const DEFAULT_API_CODE = `module.exports = {
  config: {
    auth: true
  },

  routes: {
    "/": ({ env }) => {
      return {
        app: env.APP_NAME || "Novo Projeto"
      }
    }
  }
}`;

const DEFAULT_WORKER_CODE = `module.exports = {
  config: {
    mode: "manual",
    cron: "*/5 * * * *"
  },

  run: async ({ db, env, log, params }) => {
    log("Executando rotina", "info", { params })
    return { ok: true }
  }
}`;

const DEFAULT_APP_CODE = `const fs = require("node:fs");
const path = require("node:path");

module.exports = {
  // Handler principal para app Node.js genérico.
  // Pode responder JSON, HTML, texto, ou servir arquivos estáticos.
  handle: async ({ req, res, projectRoot }) => {
    const url = new URL(req.originalUrl, "http://localhost");
    const cleanPath = decodeURIComponent(url.pathname.replace(/^\\/+/, "")) || "index.html";
    const rel = path.posix.normalize(cleanPath).replace(/^\\/+/, "");
    if (rel.includes("..")) {
      res.status(400).send("invalid_path");
      return;
    }

    const staticFile = path.join(projectRoot, "public", rel);
    if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) {
      return res.sendFile(staticFile);
    }

    res.type("html").send("<h1>Node App pronta</h1><p>Adicione arquivos em public/ ou personalize o handle no index.js.</p>");
  },
};`;

const DEFAULT_DOCKER_CODE = `module.exports = {
  // Projeto do tipo docker: o runtime é gerenciado via docker compose.
  // Este arquivo existe para manter versionamento no editor da plataforma.
};`;

const DEFAULT_DOCKERFILE = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;

const DEFAULT_DOCKER_COMPOSE = `services:
  app:
    build: .
    container_name: deploybox-\${PROJECT_SLUG:-app}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - PORT=\${DOCKER_CONTAINER_PORT:-3000}
    ports:
      - "\${DOCKER_HOST_PORT:-3000}:\${DOCKER_CONTAINER_PORT:-3000}"
`;

const DEFAULT_DOCKERIGNORE = `node_modules
npm-debug.log
.git
.gitignore
versions
`;

function resolveDockerCliPath() {
  const candidates = [
    process.env.DOCKER_CLI_PATH,
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
    'C:\\Program Files\\Docker\\Docker\\resources\\docker.exe',
    'docker',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (candidate === 'docker') return candidate;
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      // ignore
    }
  }
  return 'docker';
}

function safeSlug(slug) {
  return slug.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
}

export function projectPath(slug) {
  return path.join(projectsRoot, safeSlug(slug));
}

export function ensureProjectFiles(project) {
  const dir = projectPath(project.slug);
  const versionsDir = path.join(dir, 'versions');
  fs.mkdirSync(dir, { recursive: true, mode: PROJECT_DIR_MODE });
  fs.mkdirSync(versionsDir, { recursive: true, mode: PROJECT_DIR_MODE });
  try {
    fs.chmodSync(dir, PROJECT_DIR_MODE);
    fs.chmodSync(versionsDir, PROJECT_DIR_MODE);
  } catch (_) {
    // ignore permission apply errors on unsupported platforms
  }

  const codePath = path.join(dir, 'index.js');
  const packagePath = path.join(dir, 'package.json');
  const envPath = path.join(dir, '.env');
  const dbPath = path.join(dir, 'database.db');

  if (!fs.existsSync(codePath)) {
    const initialCode = project.code
      || (project.type === 'worker'
        ? DEFAULT_WORKER_CODE
        : project.type === 'app'
          ? DEFAULT_APP_CODE
          : project.type === 'docker'
            ? DEFAULT_DOCKER_CODE
            : DEFAULT_API_CODE);
    fs.writeFileSync(codePath, initialCode, 'utf8');
  }

  if (!fs.existsSync(packagePath)) {
    const packageJson = {
      name: `nodepanel-${project.slug}`,
      private: true,
      version: '1.0.0',
      main: project.type === 'docker' ? 'app.js' : 'index.js',
      type: 'commonjs',
    };
    if (project.type === 'docker') {
      packageJson.scripts = { start: 'node app.js' };
    }
    fs.writeFileSync(
      packagePath,
      JSON.stringify(packageJson, null, 2),
      'utf8',
    );
  }

  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `APP_NAME=${project.name}\n`, 'utf8');
  }

  if (!fs.existsSync(dbPath)) {
    const pdb = new Database(dbPath);
    pdb.exec('CREATE TABLE IF NOT EXISTS _meta (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
    pdb.close();
  }

  if (project.type === 'docker') {
    const dockerfilePath = path.join(dir, 'Dockerfile');
    const composePath = path.join(dir, 'docker-compose.yml');
    const dockerIgnorePath = path.join(dir, '.dockerignore');
    const appEntryPath = path.join(dir, 'app.js');

    if (!fs.existsSync(dockerfilePath)) fs.writeFileSync(dockerfilePath, DEFAULT_DOCKERFILE, 'utf8');
    if (!fs.existsSync(composePath)) fs.writeFileSync(composePath, DEFAULT_DOCKER_COMPOSE, 'utf8');
    if (!fs.existsSync(dockerIgnorePath)) fs.writeFileSync(dockerIgnorePath, DEFAULT_DOCKERIGNORE, 'utf8');
    if (!fs.existsSync(appEntryPath)) {
      fs.writeFileSync(
        appEntryPath,
        `const http = require('node:http');\n\nconst port = Number(process.env.PORT || 3000);\nconst appName = process.env.APP_NAME || 'DeployBox Docker App';\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });\n  res.end(JSON.stringify({ ok: true, app: appName, path: req.url }));\n});\n\nserver.listen(port, () => {\n  console.log(\`Docker app listening on \${port}\`);\n});\n`,
        'utf8',
      );
    }
  }

  return { dir, versionsDir, codePath, packagePath, envPath, dbPath };
}

export function loadEnv(projectId, slug) {
  const envRows = db.prepare('SELECT env_key, env_value FROM project_env WHERE project_id = ?').all(projectId);
  const envFromDb = Object.fromEntries(envRows.map((r) => [r.env_key, r.env_value]));

  const envPath = path.join(projectPath(slug), '.env');
  const envFromFile = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx);
      const value = trimmed.slice(idx + 1);
      envFromFile[key] = value;
    }
  }

  return { ...envFromFile, ...envFromDb };
}

export function persistEnvFile(project) {
  const envRows = db.prepare('SELECT env_key, env_value FROM project_env WHERE project_id = ? ORDER BY env_key').all(project.id);
  const content = envRows.map((r) => `${r.env_key}=${r.env_value}`).join('\n') + (envRows.length ? '\n' : '');
  fs.writeFileSync(path.join(projectPath(project.slug), '.env'), content, 'utf8');
}

export function listProjectDatabases(slug) {
  const root = projectPath(slug);
  if (!fs.existsSync(root)) return [];
  const allowedExts = new Set(['.db', '.sqlite', '.sqlite3']);
  const skipDirs = new Set(['node_modules', '.git']);
  const databases = [];
  const stack = ['.'];

  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    let entries = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      const nextRel = rel === '.' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) stack.push(nextRel);
        continue;
      }
      if (!entry.isFile() || !allowedExts.has(path.extname(entry.name).toLowerCase())) continue;

      const absFile = path.join(root, nextRel);
      let size = 0;
      let updatedAt = null;
      try {
        const st = fs.statSync(absFile);
        size = st.size;
        updatedAt = st.mtime.toISOString();
      } catch (_) {
        // ignore stat errors
      }
      databases.push({ path: nextRel.replace(/\\/g, '/'), size, updatedAt });
    }
  }

  databases.sort((a, b) => a.path.localeCompare(b.path));
  return databases;
}

export function loadProjectDb(slug, databasePath = 'database.db') {
  const root = projectPath(slug);
  const rel = path.posix.normalize(String(databasePath || 'database.db').replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!rel || rel.startsWith('..') || rel.includes('/../')) {
    throw new Error('database_path_invalid');
  }
  if (!['.db', '.sqlite', '.sqlite3'].includes(path.extname(rel).toLowerCase())) {
    throw new Error('database_extension_invalid');
  }
  const dbPath = path.join(root, rel);
  const relCheck = path.relative(root, dbPath);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new Error('database_path_outside_project');
  }
  const pdb = new Database(dbPath);
  return {
    query: (sql, params = []) => pdb.prepare(sql).all(params),
    exec: (sql) => pdb.exec(sql),
    run: (sql, params = []) => pdb.prepare(sql).run(params),
    close: () => pdb.close(),
  };
}

export function loadProjectLibraries(slug) {
  const req = createRequire(path.join(projectPath(slug), 'index.js'));
  return req;
}

async function loadProjectModule(slug) {
  const codePath = path.join(projectPath(slug), 'index.js');
  const projectRoot = projectPath(slug);
  const requireProject = createRequire(codePath);
  try {
    for (const cacheKey of Object.keys(requireProject.cache || {})) {
      const normalized = path.normalize(cacheKey);
      if (normalized.startsWith(projectRoot)) {
        delete requireProject.cache[cacheKey];
      }
    }
  } catch (_) {
    // ignore cache cleanup issues
  }

  try {
    return requireProject(codePath);
  } catch (_) {
    const mod = await import(`${pathToFileURL(codePath).href}?v=${Date.now()}`);
    return mod.default || mod;
  }
}

export async function loadApiProject(project) {
  ensureProjectFiles(project);
  const mod = await loadProjectModule(project.slug);
  runtime.apiCache.set(project.id, { loadedAt: Date.now(), mod });
  return mod;
}

export async function loadWorkerProject(project) {
  ensureProjectFiles(project);
  const mod = await loadProjectModule(project.slug);
  return mod;
}

function setProjectStatus(projectId, status) {
  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), projectId);
}

async function executeWorker(project, params = {}) {
  const mod = await loadWorkerProject(project);
  if (!mod?.run || typeof mod.run !== 'function') {
    addLog(project.id, 'error', 'Worker sem função run()');
    return;
  }

  const env = loadEnv(project.id, project.slug);
  const pdb = loadProjectDb(project.slug);
  const log = (message, level = 'info', metadata = null) => addLog(project.id, level, message, metadata);

  try {
    setProjectStatus(project.id, 'running');
    await mod.run({ db: pdb, env, log, params, require: loadProjectLibraries(project.slug) });
    setProjectStatus(project.id, 'idle');
  } catch (error) {
    setProjectStatus(project.id, 'error');
    addLog(project.id, 'error', `Worker erro: ${error.message}`);
  } finally {
    pdb.close();
  }
}

export async function startContinuousWorker(project) {
  stopContinuousWorker(project.id);
  addLog(project.id, 'info', 'Worker continuous iniciado');
  setProjectStatus(project.id, 'running');
  const interval = setInterval(async () => {
    await executeWorker(project, {});
  }, 5000);
  runtime.workers.set(project.id, { mode: 'continuous', timer: interval, startedAt: Date.now() });
}

export function stopContinuousWorker(projectId) {
  const entry = runtime.workers.get(projectId);
  if (!entry) return;

  if (entry.mode === 'continuous' && entry.timer) clearInterval(entry.timer);
  if (entry.mode === 'cron' && entry.task) entry.task.stop();

  runtime.workers.delete(projectId);
  setProjectStatus(projectId, 'stopped');
}

function runCommand(command, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || stdout || error.message));
      resolve({ stdout, stderr });
    });
  });
}

function runCommandFile(bin, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || stdout || error.message));
      resolve({ stdout, stderr });
    });
  });
}

function dockerImageName(project) {
  return `deploybox-${safeSlug(project.slug)}:latest`;
}

function dockerContainerName(project) {
  return `deploybox-${safeSlug(project.slug)}`;
}

function normalizeDockerComposeFile(project) {
  const composePath = path.join(projectPath(project.slug), 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return;
  const raw = fs.readFileSync(composePath, 'utf8');
  let next = raw;
  next = next.replace('container_name: deploybox-${PROJECT_SLUG}', 'container_name: deploybox-${PROJECT_SLUG:-app}');
  next = next.replace('container_name: deploybox-${PROJECT_SLUG:-app:-app}', 'container_name: deploybox-${PROJECT_SLUG:-app}');
  next = next.replace('- PORT=3000', '- PORT=${DOCKER_CONTAINER_PORT:-3000}');
  next = next.replace('"${HOST_PORT:-3000}:3000"', '"${DOCKER_HOST_PORT:-3000}:${DOCKER_CONTAINER_PORT:-3000}"');
  if (next !== raw) fs.writeFileSync(composePath, next, 'utf8');
}

function shouldPreferCompose(project) {
  const composePath = path.join(projectPath(project.slug), 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return false;
  let composeContent = '';
  try {
    composeContent = fs.readFileSync(composePath, 'utf8');
  } catch (_) {
    return false;
  }
  const text = String(composeContent || '');
  if (!/\bservices\s*:/.test(text)) return false;
  if (/\bimage\s*:/.test(text)) return true;
  if (/container_name\s*:\s*deploybox-\$\{PROJECT_SLUG:-app\}/.test(text)) return false;
  if (/\bcontainer_name\s*:/.test(text)) return true;
  return false;
}

async function runDockerCompose(project, args = '', extraEnv = {}) {
  const cwd = projectPath(project.slug);
  const composeEnv = { PROJECT_SLUG: safeSlug(project.slug), ...extraEnv };
  const dockerCli = String(resolveDockerCliPath() || 'docker').trim();
  const dockerBin = dockerCli.split(/\s+/)[0] || 'docker';
  const composeArgs = String(args || '').trim().split(/\s+/).filter(Boolean);

  const attempts = [
    () => runCommandFile(dockerBin, ['compose', ...composeArgs], cwd, composeEnv),
    () => runCommandFile('docker', ['compose', ...composeArgs], cwd, composeEnv),
    () => runCommandFile('docker-compose', composeArgs, cwd, composeEnv),
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('docker_compose_command_failed');
}

export async function startDockerProject(project) {
  ensureProjectFiles(project);
  normalizeDockerComposeFile(project);
  const env = loadEnv(project.id, project.slug);
  const dockerCli = resolveDockerCliPath();
  const dockerBin = String(dockerCli || 'docker').trim().split(/\s+/)[0] || 'docker';
  const cwd = projectPath(project.slug);
  const imageName = dockerImageName(project);
  const containerName = dockerContainerName(project);
  const hostPort = String(env.DOCKER_HOST_PORT || env.HOST_PORT || env.PORT || '3000');
  const containerPort = String(env.DOCKER_CONTAINER_PORT || '3000');
  const preferCompose = shouldPreferCompose(project);

  if (preferCompose) {
    await runDockerCompose(project, 'up -d --build', {
      HOST_PORT: env.DOCKER_HOST_PORT || env.HOST_PORT || env.PORT || '',
    });
    setProjectStatus(project.id, 'running');
    addLog(project.id, 'info', 'Container Docker iniciado (docker compose up -d --build)');
    return;
  }

  try {
    await runCommandFile(dockerBin, ['image', 'inspect', imageName], cwd);
    try {
      await runCommandFile(dockerBin, ['rm', '-f', containerName], cwd);
    } catch (_) {
      // ignore
    }
    await runCommandFile(dockerBin, ['run', '-d', '--name', containerName, '-p', `${hostPort}:${containerPort}`, imageName], cwd);
    setProjectStatus(project.id, 'running');
    addLog(project.id, 'info', `Container Docker iniciado (docker run ${hostPort}:${containerPort})`);
    return;
  } catch (_) {
    // fallback para docker compose quando imagem não existe
  }

  await runDockerCompose(project, 'up -d --build', {
    HOST_PORT: env.DOCKER_HOST_PORT || env.HOST_PORT || env.PORT || '',
  });
  setProjectStatus(project.id, 'running');
  addLog(project.id, 'info', 'Container Docker iniciado (docker compose up -d --build)');
}

export async function stopDockerProject(project, removeVolumes = false) {
  const downArgs = removeVolumes ? 'down -v' : 'down';
  const dockerCli = resolveDockerCliPath();
  const dockerBin = String(dockerCli || 'docker').trim().split(/\s+/)[0] || 'docker';
  const containerName = `deploybox-${safeSlug(project.slug)}`;
  const cwd = projectPath(project.slug);
  try {
    await runDockerCompose(project, downArgs);
    addLog(project.id, 'info', `Container Docker parado (docker ${downArgs})`);
  } catch (error) {
    addLog(project.id, 'warning', `Falha ao parar container Docker: ${error.message}`);
  }

  try {
    await runCommandFile(dockerBin, ['rm', '-f', containerName], cwd);
    addLog(project.id, 'info', `Container Docker parado (docker rm -f ${containerName})`);
  } catch (_) {
    // ignore: container can be absent
  } finally {
    setProjectStatus(project.id, 'stopped');
  }
}

function scheduleCronWorker(project) {
  stopContinuousWorker(project.id);
  const expression = project.cron_expression || '*/5 * * * *';
  if (!cron.validate(expression)) {
    addLog(project.id, 'error', `Cron inválido: ${expression}`);
    return;
  }

  const task = cron.schedule(expression, async () => {
    addLog(project.id, 'info', `Executando cron ${expression}`);
    await executeWorker(project, {});
  });

  task.start();
  runtime.workers.set(project.id, { mode: 'cron', task, startedAt: Date.now() });
  setProjectStatus(project.id, 'idle');
  addLog(project.id, 'info', `Worker cron agendado: ${expression}`);
}

export async function bootProjectRuntime(project) {
  ensureProjectFiles(project);

  if (!project.active) {
    if (project.type === 'docker') {
      await stopDockerProject(project);
    } else {
      stopContinuousWorker(project.id);
    }
    return;
  }

  if (project.type === 'docker') {
    try {
      await startDockerProject(project);
    } catch (error) {
      setProjectStatus(project.id, 'error');
      addLog(project.id, 'error', `Falha ao iniciar container Docker: ${error.message}`);
    }
  } else if (project.type === 'worker') {
    if (project.worker_mode === 'continuous') {
      await startContinuousWorker(project);
    } else if (project.worker_mode === 'cron') {
      scheduleCronWorker(project);
    } else {
      setProjectStatus(project.id, 'idle');
    }
  } else {
    setProjectStatus(project.id, 'running');
  }
}

export async function bootAllProjects() {
  const projects = db.prepare('SELECT * FROM projects').all();
  for (const project of projects) {
    await bootProjectRuntime(project);
  }
}

export async function runWorkerNow(project, params = {}) {
  await executeWorker(project, params);
}

export function saveVersion(projectId, code, author = 'admin') {
  const last = db
    .prepare('SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 1')
    .get(projectId);
  const tag = `v${last ? Number(last.id) + 1 : 1}`;

  const info = db
    .prepare('INSERT INTO project_versions (project_id, version_tag, code, author) VALUES (?, ?, ?, ?)')
    .run(projectId, tag, code, author);

  return db
    .prepare('SELECT id, project_id as projectId, version_tag as versionTag, code, author, created_at as createdAt FROM project_versions WHERE id = ?')
    .get(info.lastInsertRowid);
}

export function writeProjectCode(project, code) {
  const { codePath, versionsDir } = ensureProjectFiles(project);
  fs.writeFileSync(codePath, code, 'utf8');

  const version = saveVersion(project.id, code);
  fs.writeFileSync(path.join(versionsDir, `${version.versionTag}.js`), code, 'utf8');

  db.prepare('UPDATE projects SET code = ?, updated_at = ? WHERE id = ?').run(code, nowIso(), project.id);
  return version;
}

export function installProjectDependency(project, pkg) {
  const dir = projectPath(project.slug);
  return new Promise((resolve, reject) => {
    exec(`npm install ${pkg}`, { cwd: dir }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));

      const packageJsonPath = path.join(dir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const version = packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg] || 'latest';

      db.prepare(
        `INSERT INTO project_dependencies (project_id, package_name, version)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id, package_name)
         DO UPDATE SET version = excluded.version, installed_at = CURRENT_TIMESTAMP`,
      ).run(project.id, pkg, version);

      addLog(project.id, 'info', `Dependência instalada: ${pkg}@${version}`);
      resolve({ stdout, stderr, version });
    });
  });
}

export function uninstallProjectDependency(project, pkg) {
  const dir = projectPath(project.slug);
  return new Promise((resolve, reject) => {
    exec(`npm uninstall ${pkg}`, { cwd: dir }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      db.prepare('DELETE FROM project_dependencies WHERE project_id = ? AND package_name = ?').run(project.id, pkg);
      addLog(project.id, 'info', `Dependência removida: ${pkg}`);
      resolve({ stdout, stderr });
    });
  });
}

export function routeRateLimit(project, req) {
  const limit = Number(project.rate_limit || 120);
  const key = `${project.id}:${req.ip}`;
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const existing = runtime.rateMap.get(key);

  if (!existing || existing.minute !== minute) {
    runtime.rateMap.set(key, { minute, count: 1 });
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function cronPresetToExpression(preset, time = '00:00') {
  const [hour, minute] = time.split(':').map((v) => Number(v || 0));
  switch (preset) {
    case 'every_minute':
      return '* * * * *';
    case 'every_5_minutes':
      return '*/5 * * * *';
    case 'every_hour':
      return '0 * * * *';
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'monday':
      return `${minute} ${hour} * * 1`;
    default:
      return null;
  }
}

export function getRuntimeWorker(projectId) {
  return runtime.workers.get(projectId);
}

