import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import cron from 'node-cron';
import { exec } from 'node:child_process';
import Database from 'better-sqlite3';
import { db, nowIso } from './database.js';
import { addLog } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const projectsRoot = path.join(rootDir, 'projects');
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

function safeSlug(slug) {
  return slug.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
}

export function projectPath(slug) {
  return path.join(projectsRoot, safeSlug(slug));
}

export function ensureProjectFiles(project) {
  const dir = projectPath(project.slug);
  const versionsDir = path.join(dir, 'versions');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(versionsDir, { recursive: true });

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
          : DEFAULT_API_CODE);
    fs.writeFileSync(codePath, initialCode, 'utf8');
  }

  if (!fs.existsSync(packagePath)) {
    fs.writeFileSync(
      packagePath,
      JSON.stringify(
        {
          name: `nodepanel-${project.slug}`,
          private: true,
          version: '1.0.0',
          main: 'index.js',
          type: 'commonjs',
        },
        null,
        2,
      ),
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

export function loadProjectDb(slug) {
  const dbPath = path.join(projectPath(slug), 'database.db');
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
    stopContinuousWorker(project.id);
    return;
  }

  if (project.type === 'worker') {
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
