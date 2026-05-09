import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pidusage from 'pidusage';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { exec, spawn } from 'node:child_process';
import { Server } from 'socket.io';
import { Client as SshClient } from 'ssh2';
import { initMainDatabase, db, nowIso } from './services/database.js';
import {
  bootAllProjects,
  bootProjectRuntime,
  cronPresetToExpression,
  ensureProjectFiles,
  getRuntimeWorker,
  installProjectDependency,
  listProjectDatabases,
  uninstallProjectDependency,
  loadApiProject,
  loadEnv,
  loadProjectDb,
  persistEnvFile,
  projectPath,
  routeRateLimit,
  runWorkerNow,
  stopDockerProject,
  stopContinuousWorker,
  writeProjectCode,
} from './services/projectEngine.js';
import { addLog, setSocketServer } from './services/logger.js';
import { requireAuth, signToken, verifyToken } from './utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(appRootDir, '..', '.env') });
dotenv.config({ path: path.resolve(appRootDir, '.env'), override: true });

const envFileCandidates = [
  path.resolve(appRootDir, '.env'),
  path.resolve(appRootDir, '..', '.env'),
];
const writableEnvPath = envFileCandidates.find((candidate) => fs.existsSync(candidate)) || envFileCandidates[0];

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

function readSystemVersionFromEnv() {
  const fromProcess = String(process.env.SYSTEM_VERSION || '').trim();
  if (fromProcess) return fromProcess;
  if (!fs.existsSync(writableEnvPath)) return '1.0.0';
  const parsed = dotenv.parse(fs.readFileSync(writableEnvPath, 'utf8'));
  const fromFile = String(parsed?.SYSTEM_VERSION || '').trim();
  return fromFile || '1.0.0';
}

function readPortFromEnv() {
  const fromProcess = String(process.env.PORT || '').trim();
  if (fromProcess) return fromProcess;
  if (!fs.existsSync(writableEnvPath)) return '4000';
  const parsed = dotenv.parse(fs.readFileSync(writableEnvPath, 'utf8'));
  const fromFile = String(parsed?.PORT || '').trim();
  return fromFile || '4000';
}

function writeEnvValue(key, value) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  const safeValue = String(value ?? '').trim();
  const line = `${safeKey}=${safeValue}`;
  const exists = fs.existsSync(writableEnvPath);
  const raw = exists ? fs.readFileSync(writableEnvPath, 'utf8') : '';
  const lines = raw ? raw.split(/\r?\n/) : [];
  let replaced = false;
  const nextLines = lines.map((currentLine) => {
    if (String(currentLine || '').startsWith(`${safeKey}=`)) {
      replaced = true;
      return line;
    }
    return currentLine;
  });
  if (!replaced) nextLines.push(line);
  const output = `${nextLines.filter((lineItem, idx, arr) => !(idx === arr.length - 1 && lineItem === '')).join('\n')}\n`;
  fs.writeFileSync(writableEnvPath, output, 'utf8');
  process.env[safeKey] = safeValue;
}

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const port = Number(process.env.PORT || 4000);
const appBaseUrl = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
const clientDistCandidates = [
  path.resolve(appRootDir, '..', 'client', 'dist'),
  path.resolve(appRootDir, 'client', 'dist'),
  path.resolve(appRootDir, 'dist'),
];
const clientDist = clientDistCandidates.find((dir) => fs.existsSync(dir));
const translationsDir = path.join(appRootDir, 'translations');
const defaultTranslationLocale = 'pt-BR';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const githubClientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
const githubClientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
const pendingGithubOauth = new Map();

setSocketServer(io);
initMainDatabase();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

io.on('connection', (socket) => {
  socket.on('project:join', (projectId) => {
    socket.join(`project:${projectId}`);
  });

  let sshClient = null;
  let sshStream = null;

  function closeSshSession() {
    try {
      if (sshStream) sshStream.end();
    } catch (_) {
      // ignore
    }
    try {
      if (sshClient) sshClient.end();
    } catch (_) {
      // ignore
    }
    sshStream = null;
    sshClient = null;
  }

  socket.on('ssh:start', ({ token, cols, rows } = {}) => {
    try {
      const user = verifyToken(String(token || '').trim());
      if (user?.role !== 'full_admin') {
        socket.emit('ssh:error', { message: 'Acesso negado. Apenas full_admin.' });
        return;
      }
    } catch (_) {
      socket.emit('ssh:error', { message: 'Token inválido.' });
      return;
    }

    const host = String(process.env.SSH_HOST || '').trim();
    const username = String(process.env.SSH_USERNAME || '').trim();
    const password = String(process.env.SSH_PASSWORD || '').trim();
    const privateKeyRaw = String(process.env.SSH_PRIVATE_KEY || '');
    const passphrase = String(process.env.SSH_PASSPHRASE || '').trim();
    const portValue = Number(process.env.SSH_PORT || 22);
    const port = Number.isFinite(portValue) && portValue > 0 ? portValue : 22;

    if (!host || !username) {
      socket.emit('ssh:error', { message: 'Configure SSH_HOST e SSH_USERNAME no .env.' });
      return;
    }

    const privateKey = privateKeyRaw.includes('\\n') ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw;

    if (!password && !privateKey.trim()) {
      socket.emit('ssh:error', { message: 'Configure SSH_PRIVATE_KEY ou SSH_PASSWORD no .env.' });
      return;
    }

    closeSshSession();

    sshClient = new SshClient();
    sshClient
      .on('ready', () => {
        sshClient.shell(
          {
            cols: Math.max(40, Number(cols || 120)),
            rows: Math.max(10, Number(rows || 30)),
            term: 'xterm-256color',
          },
          (err, stream) => {
            if (err) {
              socket.emit('ssh:error', { message: `Falha ao abrir shell: ${err.message}` });
              closeSshSession();
              return;
            }
            sshStream = stream;
            socket.emit('ssh:status', { connected: true });
            stream.on('data', (chunk) => socket.emit('ssh:data', chunk.toString('utf8')));
            stream.on('close', () => {
              socket.emit('ssh:status', { connected: false, message: 'Sessão encerrada.' });
              closeSshSession();
            });
          },
        );
      })
      .on('error', (err) => {
        socket.emit('ssh:error', { message: `Erro SSH: ${err.message}` });
        closeSshSession();
      })
      .on('end', () => {
        socket.emit('ssh:status', { connected: false, message: 'Conexão finalizada.' });
        closeSshSession();
      })
      .connect({
        host,
        port,
        username,
        password: password || undefined,
        privateKey: privateKey.trim() ? privateKey : undefined,
        passphrase: passphrase || undefined,
        readyTimeout: 15000,
      });
  });

  socket.on('ssh:input', ({ token, data } = {}) => {
    try {
      const user = verifyToken(String(token || '').trim());
      if (user?.role !== 'full_admin') return;
    } catch (_) {
      return;
    }
    if (!sshStream) return;
    sshStream.write(String(data || ''));
  });

  socket.on('ssh:resize', ({ token, cols, rows } = {}) => {
    try {
      const user = verifyToken(String(token || '').trim());
      if (user?.role !== 'full_admin') return;
    } catch (_) {
      return;
    }
    if (!sshStream) return;
    try {
      sshStream.setWindow(Math.max(40, Number(cols || 120)), Math.max(10, Number(rows || 30)), 0, 0);
    } catch (_) {
      // ignore resize failure
    }
  });

  socket.on('ssh:stop', () => closeSshSession());
  socket.on('disconnect', () => closeSshSession());
});

function sanitizeProject(project) {
  return {
    ...project,
    active: !!project.active,
    auth_enabled: !!project.auth_enabled,
    webhook_enabled: !!project.webhook_enabled,
    api_secret: project.api_secret ? '********' : null,
  };
}

function sanitizeAppTemplate(row) {
  return {
    id: row.id,
    name: String(row.name || ''),
    category: String(row.category || ''),
    description: String(row.description || ''),
    iconDataUrl: String(row.icon_data_url || ''),
    sourceType: String(row.source_type || 'git'),
    gitUrl: String(row.git_url || ''),
    composeText: String(row.compose_text || ''),
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const templatesRootDir = path.resolve(appRootDir, '..', 'templates');
const projectsRootDir = path.resolve(appRootDir, '..', 'projects');
const templateRegistrySettingKey = 'docker_templates_registry_v1';
const templateRequiredFields = ['Name', 'Description', 'icon', 'Command'];
const installJobs = new Map();
const projectDirModeRaw = String(process.env.PROJECT_DIR_MODE || '0777').trim();
const projectDirMode = /^[0-7]{3,4}$/.test(projectDirModeRaw)
  ? Number.parseInt(projectDirModeRaw.slice(-3), 8)
  : 0o777;

function slugifyName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeTemplateSlug(value) {
  const slug = slugifyName(value);
  if (!slug) return null;
  if (slug.includes('..')) return null;
  return slug;
}

function parseJsonSafe(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function readTemplateRegistry() {
  const raw = getAppSetting(templateRegistrySettingKey, '[]');
  const parsed = parseJsonSafe(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeTemplateRegistry(items) {
  setAppSetting(templateRegistrySettingKey, JSON.stringify(items || []));
}

function ensureTemplatesRootDir() {
  fs.mkdirSync(templatesRootDir, { recursive: true });
}

function sanitizeTemplateRecord(record) {
  return {
    slug: String(record?.slug || ''),
    name: String(record?.name || ''),
    description: String(record?.description || ''),
    icon: String(record?.icon || ''),
    command: String(record?.command || ''),
    iconDataUrl: String(record?.iconDataUrl || ''),
    templateDir: String(record?.templateDir || ''),
    createdAt: String(record?.createdAt || nowIso()),
    updatedAt: String(record?.updatedAt || nowIso()),
  };
}

function readTemplateDefinitionFromDisk(slug) {
  const safeSlug = normalizeTemplateSlug(slug);
  if (!safeSlug) return null;
  const templateDir = path.join(templatesRootDir, safeSlug);
  const templateJsonPath = path.join(templateDir, 'template.json');
  if (!fs.existsSync(templateJsonPath)) return null;
  const templateJson = parseJsonSafe(fs.readFileSync(templateJsonPath, 'utf8'));
  if (!templateJson || typeof templateJson !== 'object') return null;
  const iconFile = String(templateJson.icon || '').trim();
  const iconPath = path.join(templateDir, iconFile);
  let iconDataUrl = '';
  if (iconFile && fs.existsSync(iconPath)) {
    const ext = path.extname(iconFile).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'image/png';
    const b64 = fs.readFileSync(iconPath).toString('base64');
    iconDataUrl = `data:${mime};base64,${b64}`;
  }
  return sanitizeTemplateRecord({
    slug: safeSlug,
    name: templateJson.Name,
    description: templateJson.Description,
    icon: iconFile,
    command: templateJson.Command,
    iconDataUrl,
    templateDir,
  });
}

function listDockerTemplates() {
  ensureTemplatesRootDir();
  const registry = readTemplateRegistry();
  const bySlug = new Map(registry.map((item) => [String(item.slug || ''), item]));
  const dirs = fs.readdirSync(templatesRootDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const items = [];
  for (const dir of dirs) {
    const slug = normalizeTemplateSlug(dir.name);
    if (!slug) continue;
    const current = readTemplateDefinitionFromDisk(slug);
    if (!current) continue;
    const existing = bySlug.get(slug) || {};
    items.push(
      sanitizeTemplateRecord({
        ...existing,
        ...current,
        slug,
        createdAt: existing.createdAt || nowIso(),
        updatedAt: nowIso(),
      }),
    );
  }
  writeTemplateRegistry(items);
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function pushInstallLog(jobId, message) {
  const job = installJobs.get(jobId);
  if (!job) return;
  job.logs.push(`[${new Date().toISOString()}] ${message}`);
  job.updatedAt = nowIso();
}

function generateUniqueProjectSlug(baseSlug = 'app') {
  const normalizedBase = normalizeTemplateSlug(baseSlug) || 'app';
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const candidate = normalizeTemplateSlug(`projeto-${normalizedBase}-${suffix}`);
    if (!candidate) continue;
    const candidateDir = path.join(projectsRootDir, candidate);
    if (!fs.existsSync(candidateDir)) return candidate;
  }
  const fallback = normalizeTemplateSlug(`projeto-${normalizedBase}-${Date.now()}`) || `projeto-${Date.now()}`;
  return fallback;
}

function getProjectById(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function getProjectBySlug(slug) {
  return db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
}

function isFullAdmin(req) {
  return req.user?.role === 'full_admin';
}

function assertFullAdmin(req, res) {
  if (!isFullAdmin(req)) {
    res.status(403).json({ error: 'forbidden_full_admin_only' });
    return false;
  }
  return true;
}

function canAccessProject(req, projectId) {
  if (isFullAdmin(req)) return true;
  const row = db.prepare('SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?').get(req.user.id, projectId);
  return !!row;
}

function assertProjectAccess(req, res, projectId) {
  if (!canAccessProject(req, projectId)) {
    res.status(403).json({ error: 'forbidden_project_access' });
    return false;
  }
  return true;
}

function getDirectorySizeBytes(dir) {
  if (!dir || !fs.existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (entry.isFile()) {
          total += fs.statSync(full).size;
        }
      } catch (_) {
        // ignore unreadable files
      }
    }
  }
  return total;
}

function sanitizeProjectRelativePath(inputPath) {
  const raw = String(inputPath || '').replace(/\\/g, '/').trim();
  if (!raw) return null;
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('/../')) return null;
  return normalized;
}

function listProjectTextFiles(project) {
  const root = projectPath(project.slug);
  if (!fs.existsSync(root)) return [];
  const skipDirs = new Set(['node_modules', '.git']);
  const files = [];
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
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const isSqliteDb = ['.db', '.sqlite', '.sqlite3'].includes(ext);
      const isTextish =
        ['.js', '.ts', '.tsx', '.jsx', '.json', '.env', '.md', '.txt', '.yml', '.yaml', '.sql', '.cjs', '.mjs'].includes(ext) ||
        entry.name === 'Dockerfile' ||
        entry.name === '.env' ||
        entry.name === 'package.json';
      if (!isTextish && !isSqliteDb) continue;
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
      files.push({ path: nextRel.replace(/\\/g, '/'), size, updatedAt, binary: isSqliteDb });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function listProjectDirectories(project) {
  const root = projectPath(project.slug);
  if (!fs.existsSync(root)) return [];
  const skipDirs = new Set(['.git']);
  const dirs = [];
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
      if (!entry.isDirectory()) continue;
      if (skipDirs.has(entry.name)) continue;
      const nextRel = rel === '.' ? entry.name : `${rel}/${entry.name}`;
      dirs.push(nextRel.replace(/\\/g, '/'));
      if (entry.name === 'node_modules') continue;
      stack.push(nextRel);
    }
  }
  dirs.sort((a, b) => a.localeCompare(b));
  return dirs;
}

function getUserStorageLimitBytes(userId) {
  const row = db.prepare('SELECT storage_limit_mb as storageLimitMB FROM users WHERE id = ?').get(userId);
  const limitMB = Number(row?.storageLimitMB || 0);
  if (!Number.isFinite(limitMB) || limitMB <= 0) return null;
  return Math.floor(limitMB * 1024 * 1024);
}

function getUserAccessibleProjectsForQuota(req) {
  return isFullAdmin(req)
    ? db.prepare('SELECT id, slug FROM projects').all()
    : db
        .prepare(
          `SELECT p.id, p.slug
           FROM projects p
           INNER JOIN user_projects up ON up.project_id = p.id
           WHERE up.user_id = ?`,
        )
        .all(req.user.id);
}

function getUserUsedStorageBytes(req) {
  const projects = getUserAccessibleProjectsForQuota(req);
  let total = 0;
  for (const project of projects) {
    total += getDirectorySizeBytes(projectPath(project.slug));
  }
  return total;
}

function assertWithinStorageLimit(req, res, plannedIncreaseBytes = 0) {
  if (isFullAdmin(req)) return true;
  const limitBytes = getUserStorageLimitBytes(req.user.id);
  if (!limitBytes) return true;
  const usedBytes = getUserUsedStorageBytes(req);
  const projectedBytes = usedBytes + Math.max(0, Number(plannedIncreaseBytes || 0));
  if (projectedBytes > limitBytes) {
    return res.status(403).json({
      error: 'storage_limit_exceeded',
      message: `Limite de armazenamento excedido (${(limitBytes / (1024 * 1024)).toFixed(2)} MB).`,
      limitMB: Number((limitBytes / (1024 * 1024)).toFixed(2)),
      usedMB: Number((usedBytes / (1024 * 1024)).toFixed(2)),
      projectedMB: Number((projectedBytes / (1024 * 1024)).toFixed(2)),
    }) && false;
  }
  return true;
}

const DEFAULT_TRANSLATIONS = {
  app_title: 'NodePanel',
  menu_dashboard: 'Dashboard',
  menu_projects: 'Projetos',
  menu_sql: 'SQL',
  menu_logs: 'Logs',
  menu_settings: 'Configurações',
  logout: 'Sair',
  settings_title: 'Configurações da Aplicação',
  settings_save: 'Salvar Configurações',
  settings_health_title: 'Saúde do Sistema',
  settings_health_btn: 'Testar /api/health',
  settings_users_title: 'Usuários e Permissões',
  settings_translations_title: 'Traduções',
  settings_translations_hint: 'Edite o JSON em /translations/pt-BR.json (somente full_admin).',
  settings_translations_save: 'Salvar Traduções',
};

function normalizeLocale(input) {
  const locale = String(input || '').trim();
  if (!locale) return defaultTranslationLocale;
  const cleaned = locale.replace(/_/g, '-');
  if (!/^[a-zA-Z0-9-]{2,20}$/.test(cleaned)) return defaultTranslationLocale;
  return cleaned;
}

function isValidLocale(input) {
  const locale = String(input || '').trim();
  if (!locale) return false;
  const cleaned = locale.replace(/_/g, '-');
  return /^[a-zA-Z0-9-]{2,20}$/.test(cleaned);
}

function getTranslationsFilePath(locale) {
  return path.join(translationsDir, `${normalizeLocale(locale)}.json`);
}

function listTranslationLocales() {
  fs.mkdirSync(translationsDir, { recursive: true });
  const files = fs.readdirSync(translationsDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.json'))
    .map((f) => f.name.slice(0, -5));
  const uniq = [...new Set([defaultTranslationLocale, ...files])];
  uniq.sort((a, b) => a.localeCompare(b));
  return uniq;
}

function ensureTranslationsFile(locale = defaultTranslationLocale) {
  fs.mkdirSync(translationsDir, { recursive: true });
  const translationsFile = getTranslationsFilePath(locale);
  if (fs.existsSync(translationsFile)) return;

  // Migrate legacy DB-based translations if present.
  let initial = { ...DEFAULT_TRANSLATIONS };
  const legacy = db.prepare('SELECT setting_value as value FROM app_settings WHERE setting_key = ?').get('translations_json');
  if (legacy?.value) {
    try {
      const parsed = JSON.parse(legacy.value);
      initial = { ...DEFAULT_TRANSLATIONS, ...(parsed || {}) };
    } catch (_) {
      initial = { ...DEFAULT_TRANSLATIONS };
    }
  }
  fs.writeFileSync(translationsFile, JSON.stringify(initial, null, 2), 'utf8');
}

function getTranslationsFromDb(locale = defaultTranslationLocale) {
  const safeLocale = normalizeLocale(locale);
  ensureTranslationsFile(safeLocale);
  const translationsFile = getTranslationsFilePath(safeLocale);
  try {
    const parsed = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
    return { ...DEFAULT_TRANSLATIONS, ...(parsed || {}) };
  } catch (_) {
    return { ...DEFAULT_TRANSLATIONS };
  }
}

function saveTranslationsToDb(translations, locale = defaultTranslationLocale) {
  const safeLocale = normalizeLocale(locale);
  ensureTranslationsFile(safeLocale);
  const translationsFile = getTranslationsFilePath(safeLocale);
  const payload = { ...DEFAULT_TRANSLATIONS, ...(translations || {}) };
  fs.writeFileSync(translationsFile, JSON.stringify(payload, null, 2), 'utf8');
}

function isSetupRequired() {
  const usersCount = db.prepare('SELECT COUNT(*) as total FROM users').get()?.total || 0;
  if (Number(usersCount) > 0) return false;
  const setting = db.prepare('SELECT setting_value as value FROM app_settings WHERE setting_key = ?').get('setup_completed');
  return String(setting?.value || '').toLowerCase() !== 'true';
}

function markSetupCompleted() {
  db.prepare(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
  ).run('setup_completed', 'true', nowIso());
}

function getAppSetting(key, fallbackValue = null) {
  const row = db.prepare('SELECT setting_value as value FROM app_settings WHERE setting_key = ?').get(key);
  if (!row || row.value === undefined || row.value === null || row.value === '') return fallbackValue;
  return row.value;
}

function setAppSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
  ).run(key, String(value ?? ''), nowIso());
}

function buildTemplateZip(type = 'api') {
  const zip = new AdmZip();

  if (type === 'worker') {
    zip.addFile(
      'index.js',
      Buffer.from(
        `module.exports = {
  config: {
    mode: "manual",
    cron: "*/5 * * * *"
  },

  run: async ({ db, env, log, params }) => {
    log("Worker executando", "info", { params })

    db.exec(\`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    \`)

    db.run("INSERT INTO runs DEFAULT VALUES")
    const rows = db.query("SELECT COUNT(*) AS total FROM runs")

    return {
      ok: true,
      app: env.APP_NAME || "Worker Template",
      total_runs: rows[0]?.total || 0
    }
  }
}
`,
      ),
    );
    zip.addFile(
      '.env',
      Buffer.from(`APP_NAME=Worker Template\nTOKEN=abc123\n`),
    );
    zip.addFile(
      'README.md',
      Buffer.from(
        `# Template Worker (NodePanel)

1. Edite o \`index.js\`.
2. Ajuste variáveis no \`.env\`.
3. Suba este ZIP na aba Código > Subir ZIP.
4. Configure modo/cron do projeto na UI do NodePanel.
`,
      ),
    );
  } else if (type === 'app') {
    zip.addFile(
      'index.js',
      Buffer.from(
        `const fs = require("node:fs");
const path = require("node:path");

module.exports = {
  handle: async ({ req, res, projectRoot }) => {
    const reqUrl = new URL(req.originalUrl, "http://localhost");
    const cleanPath = decodeURIComponent(reqUrl.pathname.replace(/^\\/+/, "")) || "index.html";
    const rel = path.posix.normalize(cleanPath).replace(/^\\/+/, "");
    if (rel.includes("..")) return res.status(400).send("invalid_path");

    const staticFile = path.join(projectRoot, "public", rel);
    if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) {
      return res.sendFile(staticFile);
    }

    return res.type("html").send("<h1>Node App Template</h1><p>Edite o arquivo <code>public/index.html</code> ou personalize o <code>handle</code> no index.js.</p>");
  }
}
`,
      ),
    );
    zip.addFile(
      'public/index.html',
      Buffer.from(
        `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Node App Template</title>
  </head>
  <body>
    <h1>Node App Template</h1>
    <p>Este HTML está sendo servido pelo tipo de projeto "app".</p>
  </body>
</html>
`,
      ),
    );
    zip.addFile(
      '.env',
      Buffer.from(`APP_NAME=Node App Template\nTOKEN=abc123\n`),
    );
    zip.addFile(
      'README.md',
      Buffer.from(
        `# Template App (NodePanel)

1. Edite o \`public/index.html\` para páginas estáticas.
2. Personalize \`index.js\` para lógica Node.js (handler \`handle\`).
3. Suba este ZIP na aba Código > Subir ZIP.
`,
      ),
    );
  } else if (type === 'docker') {
    zip.addFile(
      'app.js',
      Buffer.from(
        `const http = require('node:http');

const port = Number(process.env.PORT || 3000);
const appName = process.env.APP_NAME || 'DeployBox Docker App';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, app: appName, path: req.url }));
});

server.listen(port, () => {
  console.log(\`Docker app listening on \${port}\`);
});
`,
      ),
    );
    zip.addFile(
      'Dockerfile',
      Buffer.from(
        `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`,
      ),
    );
    zip.addFile(
      'docker compose.yml',
      Buffer.from(
        `services:
  app:
    build: .
    container_name: nodepanel-template-docker
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - PORT=3000
    ports:
      - "\${HOST_PORT:-3000}:3000"
`,
      ),
    );
    zip.addFile(
      '.dockerignore',
      Buffer.from(
        `node_modules
npm-debug.log
.git
.gitignore
versions
`,
      ),
    );
    zip.addFile(
      '.env',
      Buffer.from(`APP_NAME=Docker Template\nHOST_PORT=3000\n`),
    );
    zip.addFile(
      'README.md',
      Buffer.from(
        `# Template Docker (NodePanel)

1. Edite o \`app.js\`.
2. Ajuste variáveis no \`.env\`.
3. Para subir manualmente: \docker run -d\`.
4. No NodePanel, crie um projeto do tipo Docker para gerenciamento automático.
`,
      ),
    );
  } else {
    zip.addFile(
      'index.js',
      Buffer.from(
        `module.exports = {
  config: {
    auth: true
  },

  routes: {
    "/": ({ env }) => {
      return {
        ok: true,
        app: env.APP_NAME || "API Template"
      }
    },

    "/status": ({ db }) => {
      db.exec(\`
        CREATE TABLE IF NOT EXISTS visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      \`)
      db.run("INSERT INTO visits DEFAULT VALUES")
      const rows = db.query("SELECT COUNT(*) AS total FROM visits")
      return { visits: rows[0]?.total || 0 }
    }
  }
}
`,
      ),
    );
    zip.addFile(
      '.env',
      Buffer.from(`APP_NAME=API Template\nTOKEN=abc123\nAPI_URL=https://site.com\n`),
    );
    zip.addFile(
      'README.md',
      Buffer.from(
        `# Template API (NodePanel)

1. Edite o \`index.js\`.
2. Ajuste variáveis no \`.env\`.
3. Suba este ZIP na aba Código > Subir ZIP.
4. Teste a rota \`/\` e \`/status\`.
`,
      ),
    );
  }

  zip.addFile(
    'package.json',
    Buffer.from(
      JSON.stringify(
        {
          name: `nodepanel-template-${type}`,
          private: true,
          version: '1.0.0',
          main: 'index.js',
          type: 'commonjs',
        },
        null,
        2,
      ),
    ),
  );

  return zip.toBuffer();
}

function addDirectoryToZip(zip, baseDir, currentDir, rootPrefix = '') {
  const skipDirs = new Set(['node_modules', '.git']);
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const absPath = path.join(currentDir, entry.name);
    const relFromBase = path.relative(baseDir, absPath).replace(/\\/g, '/');
    const zipPath = rootPrefix ? `${rootPrefix}/${relFromBase}` : relFromBase;

    if (entry.isDirectory()) {
      addDirectoryToZip(zip, baseDir, absPath, rootPrefix);
      continue;
    }
    if (!entry.isFile()) continue;
    zip.addFile(zipPath, fs.readFileSync(absPath));
  }
}

function parseGitHubRepoUrl(repoUrl) {
  const raw = String(repoUrl || '').trim();
  const httpsMatch = raw.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/)?$/i);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  const sshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

function normalizeRepoUrl(repoUrl) {
  const raw = String(repoUrl || '').trim();
  if (!raw) return '';

  try {
    const u = new URL(raw);
    if (/^github\.com$/i.test(u.hostname)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        let repo = parts[1];
        if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4);
        if (owner && repo) return `https://github.com/${owner}/${repo}.git`;
      }
    }
  } catch (_) {
    // keep raw for non-URL inputs like git@github.com:owner/repo.git
  }

  return raw;
}

function withGitHubToken(repoUrl, token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return repoUrl;
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) return repoUrl;
  return `https://x-access-token:${encodeURIComponent(cleanToken)}@github.com/${parsed.owner}/${parsed.repo}.git`;
}

function sanitizeGitCloneError(message, token) {
  let safe = String(message || 'git_clone_failed');
  const cleanToken = String(token || '').trim();
  if (cleanToken) {
    safe = safe.replaceAll(cleanToken, '********');
    safe = safe.replaceAll(encodeURIComponent(cleanToken), '********');
  }
  return safe.replace(/https:\/\/x-access-token:[^@\s]+@github\.com/gi, 'https://github.com');
}

function runGitListBranches({ repoUrl, token }) {
  return new Promise((resolve, reject) => {
    const args = ['ls-remote', '--heads', withGitHubToken(repoUrl, token)];
    const proc = spawn('git', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += String(d || ''); });
    proc.stderr.on('data', (d) => { stderr += String(d || ''); });
    proc.on('error', (err) => reject(new Error(err.message || 'git_branches_error')));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout || `git_branches_failed_${code}`));
      const branches = stdout
        .split(/\r?\n/)
        .map((line) => line.match(/refs\/heads\/(.+)$/)?.[1])
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return resolve([...new Set(branches)]);
    });
  });
}

async function listGitHubBranchesViaApi(repoUrl, token) {
  const parsed = parseGitHubRepoUrl(repoUrl);
  const cleanToken = String(token || '').trim();
  if (!parsed || !cleanToken) throw new Error('github_api_fallback_unavailable');

  const all = [];
  for (let page = 1; page <= 10; page += 1) {
    const resp = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/branches?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cleanToken}`,
          'User-Agent': 'NodePanel',
        },
      },
    );
    if (resp.status === 401 || resp.status === 403) throw new Error('github_api_auth_failed');
    if (resp.status === 404) throw new Error('github_repo_not_found');
    if (!resp.ok) throw new Error(`github_api_branches_failed_${resp.status}`);

    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data.map((b) => String(b?.name || '').trim()).filter(Boolean));
    if (data.length < 100) break;
  }
  return [...new Set(all)].sort((a, b) => a.localeCompare(b));
}

async function listGitHubReposViaApi(token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw new Error('github_token_required');
  const repos = [];
  for (let page = 1; page <= 10; page += 1) {
    const resp = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cleanToken}`,
        'User-Agent': 'NodePanel',
      },
    });
    if (resp.status === 401 || resp.status === 403) throw new Error('github_api_auth_failed');
    if (!resp.ok) throw new Error(`github_api_repos_failed_${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...data.map((r) => ({
      id: r?.id,
      fullName: String(r?.full_name || '').trim(),
      cloneUrl: String(r?.clone_url || '').trim(),
      private: !!r?.private,
    })).filter((r) => r.fullName && r.cloneUrl));
    if (data.length < 100) break;
  }
  repos.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return repos;
}

function runGitClone({ repoUrl, branch, targetDir, token }) {
  return new Promise((resolve, reject) => {
    const args = ['clone', '--depth', '1'];
    if (branch) args.push('--branch', branch);
    args.push(withGitHubToken(repoUrl, token), targetDir);
    const proc = spawn('git', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += String(d || ''); });
    proc.stderr.on('data', (d) => { stderr += String(d || ''); });
    proc.on('error', (err) => reject(new Error(err.message || 'git_clone_error')));
    proc.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      return reject(new Error(stderr || stdout || `git_clone_failed_${code}`));
    });
  });
}

function clearProjectForGitClone(projectDir) {
  const keep = new Set(['.env', 'database.db', 'versions']);
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (keep.has(entry.name)) continue;
    const full = path.join(projectDir, entry.name);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function clearDirectoryContents(targetDir) {
  if (!fs.existsSync(targetDir)) return;
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(targetDir, entry.name);
    fs.rmSync(full, { recursive: true, force: true });
  }
}


app.post('/api/login', (req, res) => {
  if (isSetupRequired()) return res.status(403).json({ error: 'setup_required' });
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = bcrypt.compareSync(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  return res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get('/api/health', (_, res) => res.json({ ok: true, name: 'NodePanel' }));

app.get('/api/setup/status', (_, res) => {
  const required = isSetupRequired();
  return res.json({ setupRequired: required, setupCompleted: !required });
});

app.post('/api/setup/run', (req, res) => {
  if (!isSetupRequired()) return res.status(409).json({ error: 'setup_already_completed' });
  const adminName = String(req.body?.adminName || '').trim();
  const adminEmail = String(req.body?.adminEmail || '').trim().toLowerCase();
  const adminPassword = String(req.body?.adminPassword || '');
  if (!adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'admin_name_email_password_required' });
  }
  if (adminPassword.length < 6) return res.status(400).json({ error: 'admin_password_too_short' });

  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM users').run();
      const hash = bcrypt.hashSync(adminPassword, 10);
      db.prepare(
        'INSERT INTO users (name, email, password_hash, role, active, updated_at) VALUES (?, ?, ?, ?, 1, ?)',
      ).run(adminName, adminEmail, hash, 'full_admin', nowIso());
      markSetupCompleted();
    });
    tx();
  } catch (error) {
    return res.status(400).json({ error: error.message || 'setup_failed' });
  }

  return res.json({ ok: true });
});

app.get('/git/oauth/github/callback', async (req, res) => {
  const state = String(req.query?.state || '').trim();
  const code = String(req.query?.code || '').trim();
  const oauthState = pendingGithubOauth.get(state);
  pendingGithubOauth.delete(state);

  const html = (payload) => `<!doctype html><html><body><script>
  (function () {
    var payload = ${JSON.stringify(payload)};
    if (window.opener) {
      window.opener.postMessage(payload, payload.origin || window.location.origin);
    }
    window.close();
  })();
  </script></body></html>`;

  if (!oauthState || Date.now() - oauthState.createdAt > 10 * 60 * 1000) {
    return res.status(400).send(html({ type: 'nodepanel:github-oauth', ok: false, error: 'github_oauth_state_invalid' }));
  }
  if (!code) {
    return res.status(400).send(html({ type: 'nodepanel:github-oauth', ok: false, error: 'github_oauth_code_missing', origin: oauthState.origin }));
  }
  if (!githubClientId || !githubClientSecret) {
    return res.status(400).send(html({ type: 'nodepanel:github-oauth', ok: false, error: 'github_oauth_not_configured', origin: oauthState.origin }));
  }

  try {
    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code,
        state,
      }),
    });
    const data = await tokenResp.json();
    if (!tokenResp.ok || !data?.access_token) {
      return res.status(400).send(html({
        type: 'nodepanel:github-oauth',
        ok: false,
        error: data?.error || 'github_oauth_exchange_failed',
        origin: oauthState.origin,
      }));
    }
    return res.send(html({
      type: 'nodepanel:github-oauth',
      ok: true,
      token: String(data.access_token),
      origin: oauthState.origin,
    }));
  } catch (_) {
    return res.status(400).send(html({ type: 'nodepanel:github-oauth', ok: false, error: 'github_oauth_exchange_failed', origin: oauthState.origin }));
  }
});

app.use('/api', requireAuth);

app.post('/api/git/github/oauth/start', (req, res) => {
  if (!githubClientId || !githubClientSecret) {
    return res.status(400).json({ error: 'github_oauth_not_configured' });
  }
  const state = crypto.randomBytes(24).toString('hex');
  const origin = String(req.body?.origin || '').trim();
  pendingGithubOauth.set(state, {
    userId: req.user.id,
    createdAt: Date.now(),
    origin: origin || (req.headers.origin || ''),
  });

  const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${appBaseUrl || requestBaseUrl}/git/oauth/github/callback`;
  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: redirectUri,
    scope: 'repo read:org',
    state,
  });
  const authorizeUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return res.json({ ok: true, authorizeUrl });
});

app.get('/api/me', (req, res) => {
  const me = db
    .prepare('SELECT id, name, email, role, active, created_at as createdAt FROM users WHERE id = ?')
    .get(req.user.id);
  if (!me) return res.status(404).json({ error: 'user_not_found' });
  return res.json(me);
});

app.get('/api/settings', (req, res) => {
  return res.json({
    system_version: readSystemVersionFromEnv(),
    server_port: readPortFromEnv(),
  });
});

app.put('/api/settings', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const nextVersion = String(req.body?.system_version || '').trim();
  const nextPort = String(req.body?.server_port || '').trim();
  if (!nextVersion) return res.status(400).json({ error: 'system_version_required' });
  if (!nextPort) return res.status(400).json({ error: 'server_port_required' });
  if (!/^\d+$/.test(nextPort)) return res.status(400).json({ error: 'server_port_invalid' });
  const portValue = Number(nextPort);
  if (portValue < 1 || portValue > 65535) return res.status(400).json({ error: 'server_port_invalid_range' });
  writeEnvValue('SYSTEM_VERSION', nextVersion);
  writeEnvValue('PORT', String(portValue));
  return res.json({ ok: true, system_version: nextVersion, server_port: String(portValue) });
});

app.get('/api/translations', (req, res) => {
  const locale = normalizeLocale(req.query?.locale);
  return res.json({ locale, translations: getTranslationsFromDb(locale) });
});

app.get('/api/translations/locales', (req, res) => {
  const locales = listTranslationLocales();
  return res.json({ locales, defaultLocale: defaultTranslationLocale });
});

app.post('/api/translations/locales', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const rawLocale = String(req.body?.locale || '').trim();
  if (!isValidLocale(rawLocale)) return res.status(400).json({ error: 'locale_invalid' });
  const locale = normalizeLocale(rawLocale);
  ensureTranslationsFile(locale);
  return res.json({ ok: true, locale, locales: listTranslationLocales() });
});

app.put('/api/translations', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const translations = req.body?.translations;
  const locale = normalizeLocale(req.body?.locale || req.query?.locale);
  if (!translations || typeof translations !== 'object') {
    return res.status(400).json({ error: 'translations_object_required' });
  }
  saveTranslationsToDb(translations, locale);
  return res.json({ ok: true, locale, translations: getTranslationsFromDb(locale) });
});

app.get('/api/templates', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  return res.json(listDockerTemplates());
});

app.post('/api/templates/upload', upload.single('file'), (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  if (!req.file) return res.status(400).json({ error: 'template_zip_required' });
  if (!String(req.file.originalname || '').toLowerCase().endsWith('.zip')) {
    return res.status(400).json({ error: 'template_zip_invalid_extension' });
  }

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();
    const normalizedNames = entries.map((entry) => String(entry.entryName || '').replace(/\\/g, '/'));
    const topTemplatePrefix = normalizedNames.some((name) => name === 'template/' || name.startsWith('template/'));
    if (!topTemplatePrefix) return res.status(400).json({ error: 'template_root_folder_required' });

    for (const entryName of normalizedNames) {
      const rel = path.posix.normalize(entryName);
      if (!rel || rel.startsWith('../') || rel.includes('/../') || rel.startsWith('/')) {
        return res.status(400).json({ error: `template_zip_invalid_path:${entryName}` });
      }
    }

    const requiredEntries = [
      'template/template.json',
      'template/icon.png',
      'template/Dockerfile',
      'template/docker-compose.yml',
      'template/.env',
      'template/app/',
      'template/database/',
      'template/logs/',
    ];
    for (const requiredEntry of requiredEntries) {
      const found = normalizedNames.some((name) => name === requiredEntry || name.startsWith(requiredEntry));
      if (!found) return res.status(400).json({ error: `template_zip_missing:${requiredEntry}` });
    }

    const templateJsonEntry = zip.getEntry('template/template.json');
    if (!templateJsonEntry) return res.status(400).json({ error: 'template_json_not_found' });
    const templateJson = parseJsonSafe(templateJsonEntry.getData().toString('utf8'));
    if (!templateJson || typeof templateJson !== 'object') return res.status(400).json({ error: 'template_json_invalid' });
    for (const field of templateRequiredFields) {
      if (!String(templateJson[field] || '').trim()) return res.status(400).json({ error: `template_json_field_required:${field}` });
    }

    const fallbackSlug = path.basename(String(req.file.originalname || ''), '.zip');
    const slug = normalizeTemplateSlug(templateJson.Name) || normalizeTemplateSlug(fallbackSlug);
    if (!slug) return res.status(400).json({ error: 'template_slug_invalid' });

    ensureTemplatesRootDir();
    const targetDir = path.join(templatesRootDir, slug);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of entries) {
      const normalized = path.posix.normalize(String(entry.entryName || '').replace(/\\/g, '/'));
      if (!normalized || !normalized.startsWith('template/')) continue;
      const relativePath = normalized.slice('template/'.length);
      if (!relativePath) continue;
      const targetPath = path.join(targetDir, relativePath);
      const relCheck = path.relative(targetDir, targetPath);
      if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) continue;
      if (entry.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
      }
    }

    const updatedList = listDockerTemplates();
    const created = updatedList.find((item) => item.slug === slug);
    return res.status(201).json(created || { slug });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'template_upload_failed' });
  }
});

app.put('/api/templates/:slug', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const slug = normalizeTemplateSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'template_slug_invalid' });
  const templateDir = path.join(templatesRootDir, slug);
  const templateJsonPath = path.join(templateDir, 'template.json');
  if (!fs.existsSync(templateJsonPath)) return res.status(404).json({ error: 'template_not_found' });
  const payload = parseJsonSafe(fs.readFileSync(templateJsonPath, 'utf8'));
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'template_json_invalid' });
  if (req.body?.name !== undefined) payload.Name = String(req.body.name || '').trim();
  if (req.body?.description !== undefined) payload.Description = String(req.body.description || '').trim();
  if (req.body?.command !== undefined) payload.Command = String(req.body.command || '').trim();
  for (const field of templateRequiredFields) {
    if (!String(payload[field] || '').trim()) return res.status(400).json({ error: `template_json_field_required:${field}` });
  }
  fs.writeFileSync(templateJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  const updated = listDockerTemplates().find((item) => item.slug === slug);
  return res.json(updated || { slug });
});

app.delete('/api/templates/:slug', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const slug = normalizeTemplateSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'template_slug_invalid' });
  const templateDir = path.join(templatesRootDir, slug);
  if (!fs.existsSync(templateDir)) return res.status(404).json({ error: 'template_not_found' });
  fs.rmSync(templateDir, { recursive: true, force: true });
  listDockerTemplates();
  return res.json({ ok: true });
});

app.post('/api/install-template', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const templateSlug = normalizeTemplateSlug(req.body?.template);
  if (!templateSlug) return res.status(400).json({ error: 'template_required' });
  const template = listDockerTemplates().find((item) => item.slug === templateSlug);
  if (!template) return res.status(404).json({ error: 'template_not_found' });

  const requestedProjectName = normalizeTemplateSlug(req.body?.projectName);
  const projectBase = requestedProjectName || template.slug;
  let projectSlug = generateUniqueProjectSlug(projectBase);
  while (getProjectBySlug(projectSlug)) {
    projectSlug = generateUniqueProjectSlug(projectBase);
  }

  fs.mkdirSync(projectsRootDir, { recursive: true });
  const targetProjectDir = path.join(projectsRootDir, projectSlug);
  fs.mkdirSync(targetProjectDir, { recursive: true, mode: projectDirMode });
  try {
    fs.chmodSync(targetProjectDir, projectDirMode);
  } catch (_) {
    // ignore permission apply errors on unsupported platforms
  }

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    template: templateSlug,
    project: projectSlug,
    projectId: null,
    status: 'running',
    logs: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  installJobs.set(jobId, job);

  const dockerCode = `module.exports = {
  // Projeto Docker gerenciado via docker compose
};
`;
  const info = db
    .prepare(
      `INSERT INTO projects
       (name, slug, description, type, worker_mode, cron_expression, code, api_key, api_secret, auth_enabled, rate_limit, active, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      template.name || projectSlug,
      projectSlug,
      template.description || '',
      'docker',
      'manual',
      null,
      dockerCode,
      `key_${Math.random().toString(36).slice(2, 12)}`,
      `sec_${Math.random().toString(36).slice(2, 16)}`,
      0,
      120,
      1,
      'stopped',
      nowIso(),
      nowIso(),
    );
  job.projectId = Number(info.lastInsertRowid);
  const createdProject = getProjectById(job.projectId);
  ensureProjectFiles(createdProject);
  writeProjectCode(createdProject, dockerCode);
  db.prepare('INSERT OR IGNORE INTO project_env (project_id, env_key, env_value, is_secret) VALUES (?, ?, ?, 0)').run(createdProject.id, 'APP_NAME', createdProject.name);
  persistEnvFile(createdProject);

  pushInstallLog(jobId, `🚀 Instalando ${template.name}...`);
  pushInstallLog(jobId, `📁 Projeto criado: ${projectSlug} (id ${job.projectId})`);
  try {
    fs.cpSync(template.templateDir, targetProjectDir, { recursive: true });
    pushInstallLog(jobId, '📦 Template copiado para pasta de projeto.');
  } catch (copyError) {
    job.status = 'failed';
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('error', nowIso(), job.projectId);
    pushInstallLog(jobId, `❌ Falha ao copiar template: ${copyError.message}`);
    return res.status(500).json({ error: 'template_copy_failed', jobId });
  }

  const child = spawn(template.command, { cwd: targetProjectDir, shell: true });
  child.stdout.on('data', (chunk) => pushInstallLog(jobId, `🐳 ${String(chunk).trim()}`));
  child.stderr.on('data', (chunk) => pushInstallLog(jobId, `⚠️ ${String(chunk).trim()}`));
  child.on('error', (error) => {
    job.status = 'failed';
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('error', nowIso(), job.projectId);
    pushInstallLog(jobId, `❌ Falha na instalação: ${error.message}`);
  });
  child.on('close', (code) => {
    job.status = code === 0 ? 'done' : 'failed';
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(code === 0 ? 'running' : 'error', nowIso(), job.projectId);
    pushInstallLog(jobId, code === 0 ? '✅ Instalação concluída.' : `❌ Instalação finalizada com código ${code}.`);
  });

  return res.status(202).json({ ok: true, jobId, template: templateSlug, project: projectSlug, projectId: job.projectId });
});

app.get('/api/install-template/:jobId/logs', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const job = installJobs.get(String(req.params.jobId || ''));
  if (!job) return res.status(404).json({ error: 'install_job_not_found' });
  return res.json(job);
});

app.get('/api/templates/project-zip', (req, res) => {
  const requestedType = String(req.query.type || 'api').toLowerCase();
  const type = ['worker', 'app', 'docker'].includes(requestedType) ? requestedType : 'api';
  const zipBuffer = buildTemplateZip(type);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=\"nodepanel-template-${type}.zip\"`);
  return res.send(zipBuffer);
});

app.post('/api/git/branches', async (req, res) => {
  const repoUrl = normalizeRepoUrl(req.body?.repoUrl);
  const token = String(req.body?.token || '').trim();
  if (!repoUrl) return res.status(400).json({ error: 'repo_url_required' });
  if (!/^(https:\/\/|http:\/\/|git@)/i.test(repoUrl)) {
    return res.status(400).json({ error: 'repo_url_invalid' });
  }

  try {
    const branches = await runGitListBranches({ repoUrl, token });
    return res.json({ ok: true, branches });
  } catch (gitErr) {
    try {
      const branches = await listGitHubBranchesViaApi(repoUrl, token);
      return res.json({ ok: true, branches });
    } catch (apiErr) {
      const safeGitError = sanitizeGitCloneError(gitErr?.message || 'git_branches_failed', token);
      const safeApiError = sanitizeGitCloneError(apiErr?.message || 'github_api_branches_failed', token);
      return res.status(400).json({ error: `${safeGitError} | ${safeApiError}` });
    }
  }
});

app.post('/api/git/repos', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  try {
    const repos = await listGitHubReposViaApi(token);
    return res.json({ ok: true, repos });
  } catch (error) {
    return res.status(400).json({ error: sanitizeGitCloneError(error.message || 'github_api_repos_failed', token) });
  }
});

app.post('/api/projects/docker/detect-dockerfile', requireAuth, async (req, res) => {
  const repository = String(req.body?.repository || '').trim();
  const branch = String(req.body?.branch || '').trim();
  const token = String(req.body?.token || '').trim();
  if (!repository) return res.status(400).json({ error: 'repository_required' });

  const repoUrl = repository.startsWith('http') ? repository : `https://github.com/${repository}.git`;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepanel-detect-'));
  const tempRepoDir = path.join(tempRoot, 'repo');
  try {
    await runGitClone({ repoUrl, branch, targetDir: tempRepoDir, token });
    const candidates = [
      './Dockerfile',
      './docker/Dockerfile',
      './deploy/Dockerfile',
      './infra/Dockerfile',
    ];
    const found = candidates.find((candidate) => fs.existsSync(path.join(tempRepoDir, candidate.replace(/^\.\//, ''))));
    return res.json({ found: !!found, path: found || './Dockerfile' });
  } catch (_) {
    return res.json({ found: false, path: './Dockerfile' });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

app.post('/api/projects/:id/clone-git', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (!assertWithinStorageLimit(req, res, 2 * 1024 * 1024)) return;

  const repoUrl = normalizeRepoUrl(req.body?.repoUrl);
  const branch = String(req.body?.branch || '').trim();
  const token = String(req.body?.token || '').trim();
  if (!repoUrl) return res.status(400).json({ error: 'repo_url_required' });
  if (!/^(https:\/\/|http:\/\/|git@)/i.test(repoUrl)) {
    return res.status(400).json({ error: 'repo_url_invalid' });
  }

  ensureProjectFiles(project);
  const dir = projectPath(project.slug);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepanel-git-'));
  const tempRepoDir = path.join(tempRoot, 'repo');

  try {
    await runGitClone({ repoUrl, branch, targetDir: tempRepoDir, token });
    clearProjectForGitClone(dir);
    const entries = fs.readdirSync(tempRepoDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const src = path.join(tempRepoDir, entry.name);
      const dest = path.join(dir, entry.name);
      fs.cpSync(src, dest, { recursive: true, force: true });
    }

    let version = null;
    const indexPath = path.join(dir, 'index.js');
    if (fs.existsSync(indexPath)) {
      const code = fs.readFileSync(indexPath, 'utf8');
      version = writeProjectCode(project, code);
    }

    await bootProjectRuntime(getProjectById(project.id));
    addLog(project.id, 'info', `Clone Git aplicado: ${repoUrl}${branch ? `#${branch}` : ''}`);
    return res.json({ ok: true, version, repoUrl, branch: branch || null });
  } catch (error) {
    const safeError = sanitizeGitCloneError(error.message, token);
    addLog(project.id, 'error', `Falha clone Git: ${safeError}`);
    return res.status(400).json({ error: safeError });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

app.get('/api/projects', (req, res) => {
  const rows = isFullAdmin(req)
    ? db.prepare('SELECT * FROM projects ORDER BY id DESC').all()
    : db
        .prepare(
          `SELECT p.* FROM projects p
           INNER JOIN user_projects up ON up.project_id = p.id
           WHERE up.user_id = ?
           ORDER BY p.id DESC`,
        )
        .all(req.user.id);
  res.json(rows.map(sanitizeProject));
});

app.post('/api/projects', async (req, res) => {
  try {
    if (!assertFullAdmin(req, res)) return;
    const isAdmin = isFullAdmin(req);
    const data = req.body || {};
    if (!assertWithinStorageLimit(req, res, 64 * 1024)) return;
    const slug = String(data.slug || '').toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!slug) return res.status(400).json({ error: 'slug_invalido' });
    if (getProjectBySlug(slug)) return res.status(409).json({ error: 'slug_ja_existe' });

    const type = ['worker', 'app', 'docker'].includes(String(data.type || '').toLowerCase())
      ? String(data.type).toLowerCase()
      : 'api';
    const code = data.code || (type === 'worker'
      ? `module.exports = {\n  config: { mode: \"manual\", cron: \"*/5 * * * *\" },\n  run: async ({ log }) => {\n    log(\"worker iniciado\")\n    return true\n  }\n}`
      : type === 'app'
        ? `module.exports = {\n  handle: async ({ res, projectRoot, req }) => {\n    const requestPath = req.path.split('/').slice(2).join('/') || 'index.html'\n    const file = require('node:path').join(projectRoot, 'public', requestPath)\n    return res.sendFile(file)\n  }\n}`
        : type === 'docker'
          ? `module.exports = {\n  // Projeto Docker gerenciado via docker compose\n}\n`
        : `module.exports = {\n  config: { auth: true },\n  routes: {\n    \"/\": ({ env }) => ({ app: env.APP_NAME || \"${data.name || 'Projeto'}\" })\n  }\n}`);

    const info = db
      .prepare(
        `INSERT INTO projects
        (name, slug, description, type, worker_mode, cron_expression, code, api_key, api_secret, auth_enabled, rate_limit, active, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name || slug,
        slug,
        data.description || '',
        type,
        data.worker_mode || 'manual',
        data.cron_expression || null,
        code,
        (isAdmin && data.api_key) ? data.api_key : `key_${Math.random().toString(36).slice(2, 12)}`,
        (isAdmin && data.api_secret) ? data.api_secret : `sec_${Math.random().toString(36).slice(2, 16)}`,
        isAdmin && data.auth_enabled ? 1 : 0,
        Number((isAdmin ? data.rate_limit : undefined) || 120),
        isAdmin && data.active === false ? 0 : 1,
        'stopped',
        nowIso(),
        nowIso(),
      );

    const project = getProjectById(info.lastInsertRowid);
    if (!isAdmin) {
      db.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)').run(req.user.id, project.id);
    }
    ensureProjectFiles(project);
    writeProjectCode(project, code);
    db.prepare('INSERT OR IGNORE INTO project_env (project_id, env_key, env_value, is_secret) VALUES (?, ?, ?, 0)').run(project.id, 'APP_NAME', project.name);
    persistEnvFile(project);
    // Don't auto-start on creation. Deploy/start should be explicit to avoid immediate error state.
    if (project.active) {
      try {
        await bootProjectRuntime(project);
      } catch (_) {
        db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('stopped', nowIso(), project.id);
      }
    }

    return res.status(201).json(sanitizeProject(getProjectById(project.id)));
  } catch (error) {
    if (String(error?.code || '').includes('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'slug_ja_existe' });
    }
    return res.status(400).json({ error: error.message || 'project_create_failed' });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const id = Number(req.params.id);
  const current = getProjectById(id);
  if (!current) return res.status(404).json({ error: 'Projeto não encontrado' });

  try {
    const data = req.body || {};
    const next = {
      name: data.name ?? current.name,
      slug: (data.slug ?? current.slug).toLowerCase().replace(/[^a-z0-9-_]/g, ''),
      description: data.description ?? current.description,
      type: data.type ?? current.type,
      worker_mode: data.worker_mode ?? current.worker_mode,
      cron_expression: data.cron_expression ?? current.cron_expression,
      api_key: data.api_key ?? current.api_key,
      api_secret: data.api_secret ?? current.api_secret,
      auth_enabled: data.auth_enabled === undefined ? current.auth_enabled : data.auth_enabled ? 1 : 0,
      rate_limit: data.rate_limit ?? current.rate_limit,
      active: data.active === undefined ? current.active : data.active ? 1 : 0,
      webhook_enabled: data.webhook_enabled === undefined ? current.webhook_enabled : data.webhook_enabled ? 1 : 0,
    };

    const slugOwner = getProjectBySlug(next.slug);
    if (slugOwner && slugOwner.id !== id) return res.status(409).json({ error: 'slug_ja_existe' });

    db.prepare(
      `UPDATE projects SET
        name = ?, slug = ?, description = ?, type = ?, worker_mode = ?, cron_expression = ?,
        api_key = ?, api_secret = ?, auth_enabled = ?, rate_limit = ?, active = ?, webhook_enabled = ?, updated_at = ?
      WHERE id = ?`,
    ).run(
      next.name,
      next.slug,
      next.description,
      next.type,
      next.worker_mode,
      next.cron_expression,
      next.api_key,
      next.api_secret,
      next.auth_enabled,
      Number(next.rate_limit || 120),
      next.active,
      next.webhook_enabled,
      nowIso(),
      id,
    );

    const updated = getProjectById(id);
    ensureProjectFiles(updated);
    await bootProjectRuntime(updated);
    return res.json(sanitizeProject(updated));
  } catch (error) {
    if (String(error?.code || '').includes('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'slug_ja_existe' });
    }
    return res.status(400).json({ error: error.message || 'project_update_failed' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const id = Number(req.params.id);
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, id)) return;
  if (String(project.status || '').toLowerCase() === 'running') {
    return res.status(409).json({ error: 'project_running_cannot_delete' });
  }

  if (project.type === 'docker') {
    await stopDockerProject(project, true);
  } else {
    stopContinuousWorker(id);
  }
  const tx = db.transaction((projectId) => {
    db.prepare('DELETE FROM logs WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_dependencies WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_versions WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_env WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM user_projects WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  });
  tx(id);

  const dir = projectPath(project.slug);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  return res.json({ ok: true });
});

app.post('/api/projects/start-all', async (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const rows = db.prepare('SELECT id FROM projects ORDER BY id').all();
  db.prepare('UPDATE projects SET active = 1, updated_at = ?').run(nowIso());
  for (const row of rows) {
    const project = getProjectById(row.id);
    if (project) await bootProjectRuntime(project);
  }
  return res.json({ ok: true, total: rows.length });
});

app.post('/api/projects/stop-all', async (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const rows = db.prepare('SELECT id FROM projects ORDER BY id').all();
  db.prepare('UPDATE projects SET active = 0, status = ?, updated_at = ?').run('stopped', nowIso());
  for (const row of rows) {
    const project = getProjectById(row.id);
    if (!project) continue;
    if (project.type === 'docker') {
      await stopDockerProject(project);
    } else {
      stopContinuousWorker(row.id);
    }
  }
  return res.json({ ok: true, total: rows.length });
});

app.post('/api/system/restore-initial', async (req, res) => {
  if (!assertFullAdmin(req, res)) return;

  const allProjects = db.prepare('SELECT id FROM projects').all();
  for (const row of allProjects) {
    const project = getProjectById(row.id);
    if (!project) continue;
    if (project.type === 'docker') {
      await stopDockerProject(project, true);
    } else {
      stopContinuousWorker(row.id);
    }
  }

  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM logs').run();
      db.prepare('DELETE FROM project_dependencies').run();
      db.prepare('DELETE FROM project_versions').run();
      db.prepare('DELETE FROM project_env').run();
      db.prepare('DELETE FROM user_projects').run();
      db.prepare('DELETE FROM projects').run();
      db.prepare('DELETE FROM users').run();
      db.prepare('DELETE FROM app_settings').run();
    });
    tx();

    const projectsRoot = path.join(appRootDir, 'projects');
    clearDirectoryContents(projectsRoot);
    clearDirectoryContents(translationsDir);

    return res.json({ ok: true, restored: true, setupRequired: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'restore_failed' });
  }
});

app.get('/api/users', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const users = db
    .prepare('SELECT id, name, email, role, active, storage_limit_mb as storageLimitMB, created_at as createdAt, updated_at as updatedAt FROM users ORDER BY id DESC')
    .all();
  const projectLinks = db.prepare('SELECT user_id as userId, project_id as projectId FROM user_projects').all();
  const map = new Map();
  for (const link of projectLinks) {
    if (!map.has(link.userId)) map.set(link.userId, []);
    map.get(link.userId).push(link.projectId);
  }
  return res.json(users.map((u) => ({ ...u, active: !!u.active, projectIds: map.get(u.id) || [] })));
});

app.post('/api/users', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const { name, email, password, role = 'project_user', active = true, projectIds = [], storageLimitMB } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email e password são obrigatórios' });
  const hash = bcrypt.hashSync(String(password), 10);
  const parsedStorageLimit = storageLimitMB === '' || storageLimitMB === null || storageLimitMB === undefined
    ? null
    : Number(storageLimitMB);
  if (parsedStorageLimit !== null && (!Number.isFinite(parsedStorageLimit) || parsedStorageLimit < 0)) {
    return res.status(400).json({ error: 'storage_limit_mb_invalid' });
  }
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role, active, storage_limit_mb, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, email, hash, role === 'full_admin' ? 'full_admin' : 'project_user', active ? 1 : 0, parsedStorageLimit, nowIso());

  const userId = info.lastInsertRowid;
  if (role !== 'full_admin' && Array.isArray(projectIds)) {
    const stmt = db.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)');
    for (const pid of projectIds) stmt.run(userId, Number(pid));
  }
  const created = db.prepare('SELECT id, name, email, role, active, storage_limit_mb as storageLimitMB FROM users WHERE id = ?').get(userId);
  return res.status(201).json({ ...created, active: !!created.active });
});

app.put('/api/users/:id', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'user_not_found' });

  const { name, email, password, role, active, projectIds, storageLimitMB } = req.body || {};
  const nextRole = role ? (role === 'full_admin' ? 'full_admin' : 'project_user') : current.role;
  const nextHash = password ? bcrypt.hashSync(String(password), 10) : current.password_hash;
  const parsedStorageLimit = storageLimitMB === '' || storageLimitMB === null || storageLimitMB === undefined
    ? null
    : Number(storageLimitMB);
  if (parsedStorageLimit !== null && (!Number.isFinite(parsedStorageLimit) || parsedStorageLimit < 0)) {
    return res.status(400).json({ error: 'storage_limit_mb_invalid' });
  }

  db.prepare(
    `UPDATE users SET
      name = ?, email = ?, password_hash = ?, role = ?, active = ?, storage_limit_mb = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    name ?? current.name,
    email ?? current.email,
    nextHash,
    nextRole,
    active === undefined ? current.active : active ? 1 : 0,
    storageLimitMB === undefined ? current.storage_limit_mb : parsedStorageLimit,
    nowIso(),
    id,
  );

  if (nextRole === 'full_admin') {
    db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(id);
  } else if (Array.isArray(projectIds)) {
    db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(id);
    const stmt = db.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)');
    for (const pid of projectIds) stmt.run(id, Number(pid));
  }

  const updated = db.prepare('SELECT id, name, email, role, active, storage_limit_mb as storageLimitMB FROM users WHERE id = ?').get(id);
  const links = db.prepare('SELECT project_id as projectId FROM user_projects WHERE user_id = ?').all(id).map((r) => r.projectId);
  return res.json({ ...updated, active: !!updated.active, projectIds: links });
});

app.delete('/api/users/:id', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(id);
  return res.json({ ok: true });
});

app.post('/api/projects/:id/restart', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  if (project.type === 'docker') {
    await stopDockerProject(project);
  } else {
    stopContinuousWorker(project.id);
  }
  await bootProjectRuntime(project);
  addLog(project.id, 'info', 'Projeto reiniciado');

  return res.json({ ok: true });
});

app.post('/api/projects/:id/toggle', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const active = project.active ? 0 : 1;
  db.prepare('UPDATE projects SET active = ?, updated_at = ? WHERE id = ?').run(active, nowIso(), project.id);
  const updated = getProjectById(project.id);

  if (!updated.active) {
    if (updated.type === 'docker') {
      await stopDockerProject(updated);
    } else {
      stopContinuousWorker(updated.id);
    }
  } else {
    await bootProjectRuntime(updated);
  }

  res.json(sanitizeProject(updated));
});

app.post('/api/projects/:id/run-now', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (project.type !== 'worker') return res.status(400).json({ error: 'Somente workers' });

  await runWorkerNow(project, req.body?.params || {});
  res.json({ ok: true });
});

app.post('/api/projects/:id/docker/execute', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (project.type !== 'docker') return res.status(400).json({ error: 'Projeto não é do tipo docker' });

  const command = String(req.body?.command || '').trim();
  const portRaw = String(req.body?.port || '').trim();
  if (!command) return res.status(400).json({ error: 'command_required' });
  if (command.length > 1000) return res.status(400).json({ error: 'command_too_long' });
  if (!/^docker(?:-compose)?(\s|$)/i.test(command)) {
    return res.status(400).json({ error: 'only_docker_commands_allowed' });
  }
  if (/[;&|`><]/.test(command)) {
    return res.status(400).json({ error: 'unsafe_command' });
  }

  let hostPort = '';
  if (portRaw) {
    if (!/^\d+$/.test(portRaw)) return res.status(400).json({ error: 'invalid_port' });
    const num = Number(portRaw);
    if (num < 1 || num > 65535) return res.status(400).json({ error: 'invalid_port' });
    hostPort = String(num);
  }

  const cwd = projectPath(project.slug);
  const dockerCli = resolveDockerCliPath();
  const normalizedCommand = command.replace(/^docker(?:\.exe)?/i, `"${dockerCli}"`);
  try {
    const result = await new Promise((resolve, reject) => {
      exec(
        normalizedCommand,
        {
          cwd,
          timeout: 10 * 60 * 1000,
          env: {
            ...process.env,
            HOST_PORT: hostPort,
            PROJECT_SLUG: String(project.slug || ''),
          },
        },
        (error, stdout, stderr) => {
          if (error) return reject(new Error(stderr || stdout || error.message));
          resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        },
      );
    });
    addLog(project.id, 'info', `Docker command executado: ${command}`);
    return res.json({ ok: true, ...result });
  } catch (error) {
    addLog(project.id, 'error', `Falha docker command: ${error.message}`);
    return res.status(400).json({ error: error.message || 'docker_command_failed' });
  }
});

app.post('/api/projects/:id/docker/run-dockerfile', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (project.type !== 'docker') return res.status(400).json({ error: 'Projeto não é do tipo docker' });

  const dockerfile = String(req.body?.dockerfile || '');
  const portRaw = String(req.body?.port || '3000').trim();
  const containerPortRaw = String(req.body?.containerPort || '3000').trim();
  if (!dockerfile.trim()) return res.status(400).json({ error: 'dockerfile_required' });

  if (!/^\d+$/.test(portRaw)) return res.status(400).json({ error: 'invalid_port' });
  const hostPort = Number(portRaw);
  if (hostPort < 1 || hostPort > 65535) return res.status(400).json({ error: 'invalid_port' });
  if (!/^\d+$/.test(containerPortRaw)) return res.status(400).json({ error: 'invalid_container_port' });
  const containerPort = Number(containerPortRaw);
  if (containerPort < 1 || containerPort > 65535) return res.status(400).json({ error: 'invalid_container_port' });

  const slugSafe = String(project.slug || '').replace(/[^a-z0-9-_]/gi, '').toLowerCase() || `project-${project.id}`;
  const imageName = `deploybox-${slugSafe}:latest`;
  const containerName = `deploybox-${slugSafe}`;
  const cwd = projectPath(project.slug);
  const dockerfilePath = path.join(cwd, 'Dockerfile');
  const dockerCli = resolveDockerCliPath();

  fs.writeFileSync(dockerfilePath, dockerfile, 'utf8');
  db.prepare(
    `INSERT INTO project_env (project_id, env_key, env_value, is_secret, updated_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(project_id, env_key)
     DO UPDATE SET env_value = excluded.env_value, updated_at = excluded.updated_at`,
  ).run(project.id, 'DOCKER_HOST_PORT', String(hostPort), nowIso());
  db.prepare(
    `INSERT INTO project_env (project_id, env_key, env_value, is_secret, updated_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(project_id, env_key)
     DO UPDATE SET env_value = excluded.env_value, updated_at = excluded.updated_at`,
  ).run(project.id, 'DOCKER_CONTAINER_PORT', String(containerPort), nowIso());
  persistEnvFile(project);

  const runExec = (command) =>
    new Promise((resolve, reject) => {
      exec(command, { cwd, timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || stdout || error.message));
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });

  try {
    await runExec(`"${dockerCli}" --version`);
  } catch (_) {
    return res.status(400).json({ error: 'docker_not_installed_or_not_running' });
  }

  try {
    const logs = [];
    const build = await runExec(`"${dockerCli}" build -t ${imageName} .`);
    logs.push(build.stdout, build.stderr);

    try {
      await runExec(`"${dockerCli}" rm -f ${containerName}`);
    } catch (_) {
      // ignore: container may not exist yet
    }

    const run = await runExec(`"${dockerCli}" run -d --name ${containerName} -p ${hostPort}:${containerPort} ${imageName}`);
    logs.push(run.stdout, run.stderr);

    addLog(project.id, 'info', `Dockerfile executado: build+run ${hostPort}->${containerPort}`);
    return res.json({
      ok: true,
      image: imageName,
      container: containerName,
      port: hostPort,
      containerPort,
      output: logs.filter(Boolean).join('\n').trim(),
    });
  } catch (error) {
    addLog(project.id, 'error', `Falha ao executar Dockerfile: ${error.message}`);
    return res.status(400).json({ error: error.message || 'dockerfile_run_failed' });
  }
});

app.delete('/api/projects/:id/docker/image', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (project.type !== 'docker') return res.status(400).json({ error: 'Projeto não é do tipo docker' });

  const slugSafe = String(project.slug || '').replace(/[^a-z0-9-_]/gi, '').toLowerCase() || `project-${project.id}`;
  const imageName = `deploybox-${slugSafe}:latest`;
  const containerName = `deploybox-${slugSafe}`;
  const dockerCli = resolveDockerCliPath();
  const cwd = projectPath(project.slug);

  const runExec = (command) =>
    new Promise((resolve, reject) => {
      exec(command, { cwd, timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || stdout || error.message));
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });

  try {
    await runExec(`"${dockerCli}" --version`);
  } catch (_) {
    return res.status(400).json({ error: 'docker_not_installed_or_not_running' });
  }

  const logs = [];
  try {
    try {
      const running = await runExec(`"${dockerCli}" inspect -f "{{.State.Running}}" ${containerName}`);
      if (String(running.stdout || '').trim().toLowerCase() === 'true') {
        return res.status(409).json({ error: 'docker_container_running_stop_first' });
      }
    } catch (_) {
      // container may not exist
    }

    try {
      const rmContainer = await runExec(`"${dockerCli}" rm -f ${containerName}`);
      logs.push(rmContainer.stdout, rmContainer.stderr);
    } catch (_) {}

    const rmImage = await runExec(`"${dockerCli}" rmi -f ${imageName}`);
    logs.push(rmImage.stdout, rmImage.stderr);

    addLog(project.id, 'info', `Imagem Docker removida: ${imageName}`);
    return res.json({ ok: true, image: imageName, output: logs.filter(Boolean).join('\n').trim() });
  } catch (error) {
    addLog(project.id, 'error', `Falha ao remover imagem Docker: ${error.message}`);
    return res.status(400).json({ error: error.message || 'docker_image_remove_failed' });
  }
});

app.get('/api/projects/:id/logs', (req, res) => {
  const id = Number(req.params.id);
  if (!assertProjectAccess(req, res, id)) return;
  const level = req.query.level ? String(req.query.level) : null;
  const rows = level
    ? db
        .prepare('SELECT id, project_id as projectId, level, message, metadata, created_at as createdAt FROM logs WHERE project_id = ? AND level = ? ORDER BY id DESC LIMIT 500')
        .all(id, level)
    : db
        .prepare('SELECT id, project_id as projectId, level, message, metadata, created_at as createdAt FROM logs WHERE project_id = ? ORDER BY id DESC LIMIT 500')
        .all(id);

  res.json(
    rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    })),
  );
});

app.delete('/api/projects/:id/logs', (req, res) => {
  const id = Number(req.params.id);
  if (!assertProjectAccess(req, res, id)) return;
  db.prepare('DELETE FROM logs WHERE project_id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/projects/:id/stats', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const usage = await pidusage(process.pid);
  const runtime = getRuntimeWorker(project.id);

  res.json({
    projectId: project.id,
    cpu: Number(usage.cpu.toFixed(2)),
    memoryMB: Number((usage.memory / (1024 * 1024)).toFixed(2)),
    uptimeSec: runtime?.startedAt ? Math.floor((Date.now() - runtime.startedAt) / 1000) : process.uptime(),
    status: project.status,
    pid: process.pid,
  });
});

app.post('/api/projects/:id/sql/run', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const sql = String(req.body?.sql || '').trim();
  if (!sql) return res.status(400).json({ error: 'SQL obrigatório' });
  const databasePath = String(req.body?.databasePath || 'database.db').trim() || 'database.db';
  const databases = listProjectDatabases(project.slug);
  if (!databases.some((item) => item.path === databasePath)) {
    return res.status(404).json({ error: 'database_not_found' });
  }

  const pdb = loadProjectDb(project.slug, databasePath);
  try {
    const command = sql.split(/\s+/)[0].toUpperCase();
    if (command === 'SELECT' || command === 'PRAGMA') {
      const rows = pdb.query(sql);
      return res.json({ type: 'select', rows });
    }

    pdb.exec(sql);
    addLog(project.id, 'info', `SQL executado: ${command}`);
    return res.json({ type: 'exec', message: 'Executado com sucesso' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  } finally {
    pdb.close();
  }
});

app.get('/api/projects/:id/databases', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  ensureProjectFiles(project);
  return res.json({ databases: listProjectDatabases(project.slug) });
});

app.get('/api/projects/:id/versions', (req, res) => {
  if (!assertProjectAccess(req, res, Number(req.params.id))) return;
  const rows = db
    .prepare('SELECT id, project_id as projectId, version_tag as versionTag, author, created_at as createdAt FROM project_versions WHERE project_id = ? ORDER BY id DESC')
    .all(Number(req.params.id));
  res.json(rows);
});

app.get('/api/projects/:id/versions/:versionId', (req, res) => {
  if (!assertProjectAccess(req, res, Number(req.params.id))) return;
  const row = db
    .prepare('SELECT id, project_id as projectId, version_tag as versionTag, code, author, created_at as createdAt FROM project_versions WHERE project_id = ? AND id = ?')
    .get(Number(req.params.id), Number(req.params.versionId));
  if (!row) return res.status(404).json({ error: 'Versão não encontrada' });
  res.json(row);
});

app.post('/api/projects/:id/restore/:versionId', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const version = db
    .prepare('SELECT code FROM project_versions WHERE project_id = ? AND id = ?')
    .get(project.id, Number(req.params.versionId));

  if (!version) return res.status(404).json({ error: 'Versão não encontrada' });

  writeProjectCode(project, version.code);
  await bootProjectRuntime(getProjectById(project.id));
  addLog(project.id, 'warning', `Versão restaurada: ${req.params.versionId}`);

  res.json({ ok: true });
});

app.get('/api/projects/:id/env', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const rows = db
    .prepare('SELECT id, env_key as envKey, env_value as envValue, is_secret as isSecret, updated_at as updatedAt FROM project_env WHERE project_id = ? ORDER BY env_key')
    .all(project.id);

  res.json(rows.map((r) => ({ ...r, isSecret: !!r.isSecret })));
});

app.post('/api/projects/:id/env', (req, res) => {
  try {
    const project = getProjectById(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    if (!assertProjectAccess(req, res, project.id)) return;

    const { envKey, envValue, isSecret } = req.body || {};
    if (!envKey) return res.status(400).json({ error: 'envKey obrigatório' });

    db.prepare(
      `INSERT INTO project_env (project_id, env_key, env_value, is_secret, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, env_key)
       DO UPDATE SET env_value = excluded.env_value, is_secret = excluded.is_secret, updated_at = excluded.updated_at`,
    ).run(project.id, envKey, String(envValue ?? ''), isSecret ? 1 : 0, nowIso());

    persistEnvFile(project);
    addLog(project.id, 'info', `Variável atualizada: ${envKey}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'env_update_failed' });
  }
});

app.delete('/api/projects/:id/env/:key', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  db.prepare('DELETE FROM project_env WHERE project_id = ? AND env_key = ?').run(project.id, req.params.key);
  persistEnvFile(project);
  res.json({ ok: true });
});

app.get('/api/projects/:id/dependencies', (req, res) => {
  if (!assertProjectAccess(req, res, Number(req.params.id))) return;
  const rows = db
    .prepare('SELECT id, package_name as packageName, version, installed_at as installedAt FROM project_dependencies WHERE project_id = ? ORDER BY package_name')
    .all(Number(req.params.id));
  res.json(rows);
});

app.post('/api/projects/:id/dependencies', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (!assertWithinStorageLimit(req, res, 512 * 1024)) return;

  const pkg = String(req.body?.packageName || '').trim();
  if (!pkg) return res.status(400).json({ error: 'packageName obrigatório' });

  try {
    const result = await installProjectDependency(project, pkg);
    res.json({ ok: true, version: result.version });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/dependencies/:pkg', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  const pkg = String(req.params.pkg || '').trim();
  if (!pkg) return res.status(400).json({ error: 'packageName obrigatório' });
  try {
    await uninstallProjectDependency(project, pkg);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/api/projects/:id/files', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  ensureProjectFiles(project);
  return res.json({ files: listProjectTextFiles(project), dirs: listProjectDirectories(project) });
});

app.get('/api/projects/:id/file', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const relPath = sanitizeProjectRelativePath(req.query.path);
  if (!relPath) return res.status(400).json({ error: 'path_invalid' });

  const root = projectPath(project.slug);
  const full = path.join(root, relPath);
  const relCheck = path.relative(root, full);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) return res.status(400).json({ error: 'path_outside_project' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'file_not_found' });
  if (['.db', '.sqlite', '.sqlite3'].includes(path.extname(full).toLowerCase())) {
    return res.status(400).json({ error: 'binary_file_use_sql_tab' });
  }

  try {
    const content = fs.readFileSync(full, 'utf8');
    return res.json({ path: relPath, content });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'file_read_error' });
  }
});

app.put('/api/projects/:id/file', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const relPath = sanitizeProjectRelativePath(req.body?.path);
  const content = req.body?.content;
  if (!relPath) return res.status(400).json({ error: 'path_invalid' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content_string_required' });

  const root = projectPath(project.slug);
  const full = path.join(root, relPath);
  const relCheck = path.relative(root, full);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) return res.status(400).json({ error: 'path_outside_project' });

  const currentSize = fs.existsSync(full) ? fs.statSync(full).size : 0;
  const nextSize = Buffer.byteLength(content, 'utf8');
  const delta = Math.max(0, nextSize - currentSize);
  if (!assertWithinStorageLimit(req, res, delta)) return;

  fs.mkdirSync(path.dirname(full), { recursive: true });
  let version = null;
  if (relPath === 'index.js') {
    version = writeProjectCode(project, content);
  } else {
    fs.writeFileSync(full, content, 'utf8');
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), project.id);
  }

  await bootProjectRuntime(getProjectById(project.id));
  addLog(project.id, 'info', `Arquivo salvo: ${relPath}`);
  return res.json({ ok: true, path: relPath, version });
});

app.delete('/api/projects/:id/file', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const relPath = sanitizeProjectRelativePath(req.query.path);
  if (!relPath) return res.status(400).json({ error: 'path_invalid' });

  const root = projectPath(project.slug);
  const full = path.join(root, relPath);
  const relCheck = path.relative(root, full);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) return res.status(400).json({ error: 'path_outside_project' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'file_not_found' });
  if (!fs.statSync(full).isFile()) return res.status(400).json({ error: 'path_not_file' });

  fs.rmSync(full, { force: true });
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), project.id);
  addLog(project.id, 'warning', `Arquivo removido: ${relPath}`);
  return res.json({ ok: true, path: relPath });
});

app.post('/api/projects/:id/folder', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const relPath = sanitizeProjectRelativePath(req.body?.path);
  if (!relPath) return res.status(400).json({ error: 'path_invalid' });

  const root = projectPath(project.slug);
  const full = path.join(root, relPath);
  const relCheck = path.relative(root, full);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) return res.status(400).json({ error: 'path_outside_project' });

  try {
    fs.mkdirSync(full, { recursive: true });
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), project.id);
    addLog(project.id, 'info', `Pasta criada: ${relPath}`);
    return res.json({ ok: true, path: relPath });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'folder_create_error' });
  }
});

app.delete('/api/projects/:id/folder', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const relPath = sanitizeProjectRelativePath(req.query.path);
  if (!relPath) return res.status(400).json({ error: 'path_invalid' });

  const root = projectPath(project.slug);
  const full = path.join(root, relPath);
  const relCheck = path.relative(root, full);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) return res.status(400).json({ error: 'path_outside_project' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'folder_not_found' });
  if (!fs.statSync(full).isDirectory()) return res.status(400).json({ error: 'path_not_folder' });

  fs.rmSync(full, { recursive: true, force: true });
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), project.id);
  addLog(project.id, 'warning', `Pasta removida: ${relPath}`);
  return res.json({ ok: true, path: relPath });
});

app.post('/api/projects/:id/move', (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const fromPath = sanitizeProjectRelativePath(req.body?.fromPath);
  const toPath = sanitizeProjectRelativePath(req.body?.toPath);
  if (!fromPath || !toPath) return res.status(400).json({ error: 'path_invalid' });
  if (fromPath === toPath) return res.status(400).json({ error: 'path_same' });

  const root = projectPath(project.slug);
  const fromFull = path.join(root, fromPath);
  const toFull = path.join(root, toPath);
  const fromCheck = path.relative(root, fromFull);
  const toCheck = path.relative(root, toFull);
  if (fromCheck.startsWith('..') || path.isAbsolute(fromCheck)) return res.status(400).json({ error: 'path_outside_project' });
  if (toCheck.startsWith('..') || path.isAbsolute(toCheck)) return res.status(400).json({ error: 'path_outside_project' });
  if (!fs.existsSync(fromFull)) return res.status(404).json({ error: 'source_not_found' });
  if (fs.existsSync(toFull)) return res.status(409).json({ error: 'target_already_exists' });

  const sourceStat = fs.statSync(fromFull);
  if (sourceStat.isDirectory() && (toPath.startsWith(`${fromPath}/`) || toPath === fromPath)) {
    return res.status(400).json({ error: 'invalid_move_target' });
  }

  try {
    fs.mkdirSync(path.dirname(toFull), { recursive: true });
    fs.renameSync(fromFull, toFull);
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), project.id);
    addLog(project.id, 'warning', `Item movido: ${fromPath} -> ${toPath}`);
    return res.json({ ok: true, fromPath, toPath });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'move_failed' });
  }
});

app.post('/api/projects/:id/code', async (req, res) => {
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;

  const code = String(req.body?.code || '');
  if (!code.trim()) return res.status(400).json({ error: 'code obrigatório' });
  if (!assertWithinStorageLimit(req, res, Buffer.byteLength(code, 'utf8'))) return;

  const version = writeProjectCode(project, code);
  await bootProjectRuntime(getProjectById(project.id));
  addLog(project.id, 'info', `Código salvo: ${version.versionTag}`);

  res.json({ ok: true, version });
});

app.post('/api/projects/:id/upload-zip', upload.single('file'), async (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const project = getProjectById(Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  if (!assertProjectAccess(req, res, project.id)) return;
  if (!req.file) return res.status(400).json({ error: 'Arquivo ZIP obrigatório' });
  if (!req.file.originalname.toLowerCase().endsWith('.zip')) return res.status(400).json({ error: 'Envie um arquivo .zip' });
  if (!assertWithinStorageLimit(req, res, req.file.size)) return;

  const dir = projectPath(project.slug);
  ensureProjectFiles(project);

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();
    let filesWritten = 0;

    for (const entry of entries) {
      const normalized = path.normalize(entry.entryName.replace(/\\/g, '/'));
      if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
        return res.status(400).json({ error: `Caminho inválido no ZIP: ${entry.entryName}` });
      }

      const fullPath = path.join(dir, normalized);
      const rel = path.relative(dir, fullPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return res.status(400).json({ error: `Entrada fora da pasta do projeto: ${entry.entryName}` });
      }

      if (entry.isDirectory) {
        fs.mkdirSync(fullPath, { recursive: true });
        continue;
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, entry.getData());
      filesWritten += 1;
    }

    let version = null;
    const indexPath = path.join(dir, 'index.js');
    if (fs.existsSync(indexPath)) {
      const code = fs.readFileSync(indexPath, 'utf8');
      version = writeProjectCode(project, code);
    }

    await bootProjectRuntime(getProjectById(project.id));
    addLog(project.id, 'info', `Upload ZIP aplicado (${filesWritten} arquivos)`);

    return res.json({ ok: true, filesWritten, version });
  } catch (error) {
    addLog(project.id, 'error', `Falha upload ZIP: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
});

app.get('/api/cron/preview', (req, res) => {
  const preset = String(req.query.preset || '');
  const time = String(req.query.time || '00:00');
  const expression = preset === 'custom' ? String(req.query.expression || '') : cronPresetToExpression(preset, time);
  if (!expression) return res.status(400).json({ error: 'Preset inválido' });

  res.json({ expression });
});

app.get('/api/dashboard/stats', async (req, res) => {
  const usage = await pidusage(process.pid);
  const projectsRows = isFullAdmin(req)
    ? db.prepare('SELECT id, name, slug, type, status, active FROM projects ORDER BY id DESC').all()
    : db
        .prepare(
          `SELECT p.id, p.name, p.slug, p.type, p.status, p.active
           FROM projects p
           INNER JOIN user_projects up ON up.project_id = p.id
           WHERE up.user_id = ?
           ORDER BY p.id DESC`,
        )
        .all(req.user.id);
  const projects = projectsRows.map((p) => {
    const bytes = getDirectorySizeBytes(projectPath(p.slug));
    return {
      ...p,
      active: !!p.active,
      sizeBytes: bytes,
      sizeMB: Number((bytes / (1024 * 1024)).toFixed(2)),
    };
  });
  const totalProjectsSizeBytes = projects.reduce((sum, p) => sum + (p.sizeBytes || 0), 0);
  res.json({
    cpu: Number(usage.cpu.toFixed(2)),
    memoryMB: Number((usage.memory / (1024 * 1024)).toFixed(2)),
    uptimeSec: Math.floor(process.uptime()),
    totalProjectsSizeBytes,
    totalProjectsSizeMB: Number((totalProjectsSizeBytes / (1024 * 1024)).toFixed(2)),
    projects,
  });
});

app.get('/api/logs', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const level = req.query.level ? String(req.query.level) : null;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const limit = Math.min(Number(req.query.limit || 500), 2000);

  let rows;
  if (projectId && level) {
    rows = db
      .prepare(
        `SELECT l.id, l.project_id as projectId, p.name as projectName, p.slug as projectSlug, l.level, l.message, l.metadata, l.created_at as createdAt
         FROM logs l
         LEFT JOIN projects p ON p.id = l.project_id
         WHERE l.project_id = ? AND l.level = ?
         ORDER BY l.id DESC LIMIT ?`,
      )
      .all(projectId, level, limit);
  } else if (projectId) {
    rows = db
      .prepare(
        `SELECT l.id, l.project_id as projectId, p.name as projectName, p.slug as projectSlug, l.level, l.message, l.metadata, l.created_at as createdAt
         FROM logs l
         LEFT JOIN projects p ON p.id = l.project_id
         WHERE l.project_id = ?
         ORDER BY l.id DESC LIMIT ?`,
      )
      .all(projectId, limit);
  } else if (level) {
    rows = db
      .prepare(
        `SELECT l.id, l.project_id as projectId, p.name as projectName, p.slug as projectSlug, l.level, l.message, l.metadata, l.created_at as createdAt
         FROM logs l
         LEFT JOIN projects p ON p.id = l.project_id
         WHERE l.level = ?
         ORDER BY l.id DESC LIMIT ?`,
      )
      .all(level, limit);
  } else {
    rows = db
      .prepare(
        `SELECT l.id, l.project_id as projectId, p.name as projectName, p.slug as projectSlug, l.level, l.message, l.metadata, l.created_at as createdAt
         FROM logs l
         LEFT JOIN projects p ON p.id = l.project_id
         ORDER BY l.id DESC LIMIT ?`,
      )
      .all(limit);
  }

  res.json(rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })));
});

app.delete('/api/logs', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (projectId) {
    db.prepare('DELETE FROM logs WHERE project_id = ?').run(projectId);
  } else {
    db.prepare('DELETE FROM logs').run();
  }
  res.json({ ok: true });
});

app.post('/api/sql/run', (req, res) => {
  if (!assertFullAdmin(req, res)) return;
  const sql = String(req.body?.sql || '').trim();
  if (!sql) return res.status(400).json({ error: 'SQL obrigatório' });

  try {
    const command = sql.split(/\s+/)[0].toUpperCase();
    if (command === 'SELECT' || command === 'PRAGMA') {
      const rows = db.prepare(sql).all();
      return res.json({ type: 'select', rows });
    }

    db.exec(sql);
    return res.json({ type: 'exec', message: 'Executado com sucesso' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.all('/:slug*', async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();

  const slug = req.params.slug;
  const project = getProjectBySlug(slug);
  if (!project || !['api', 'app'].includes(project.type) || !project.active) return next();

  if (!routeRateLimit(project, req)) {
    return res.status(429).json({ error: 'rate_limit_exceeded' });
  }

  if (project.auth_enabled) {
    const key = req.headers['x-api-key'];
    if (!key || key !== project.api_key) return res.status(401).json({ error: 'invalid_api_key' });
  }

  try {
    const mod = await loadApiProject(project);

    let routePath = '/';
    if (req.path.length > slug.length + 1) {
      routePath = req.path.slice(slug.length + 1);
      if (!routePath.startsWith('/')) routePath = `/${routePath}`;
    }

    const env = loadEnv(project.id, project.slug);
    const pdb = loadProjectDb(project.slug);
    const log = (message, level = 'info', metadata = null) => addLog(project.id, level, message, metadata);
    const projectRoot = projectPath(project.slug);

    try {
      if (project.type === 'app') {
        if (typeof mod?.handle === 'function') {
          const result = await mod.handle({
            env,
            db: pdb,
            req,
            res,
            body: req.body,
            query: req.query,
            params: req.params,
            log,
            projectRoot,
            routePath,
          });
          if (!res.headersSent && result !== undefined) {
            if (typeof result === 'object') return res.json(result);
            return res.send(String(result));
          }
          if (res.headersSent) return;
        } else {
          const safeRel = routePath === '/' ? 'index.html' : routePath.slice(1);
          const normalized = path.posix.normalize(safeRel).replace(/^\/+/, '');
          if (normalized.startsWith('..') || normalized.includes('/../')) {
            return res.status(400).json({ error: 'invalid_path' });
          }
          const staticPath = path.join(projectRoot, 'public', normalized);
          if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
            addLog(project.id, 'info', `${req.method} ${req.path}`);
            return res.sendFile(staticPath);
          }
          return res.status(404).json({ error: 'file_not_found' });
        }
      } else {
        const routes = mod?.routes || {};
        const handler = routes[routePath];
        if (!handler) return res.status(404).json({ error: 'route_not_found' });

        const payload = await handler({
          env,
          db: pdb,
          req,
          body: req.body,
          query: req.query,
          params: req.params,
          log,
        });

        if (routePath === '/webhook' || req.path.endsWith('/webhook')) {
          addLog(project.id, 'info', 'Webhook recebido', { body: req.body });
        }

        addLog(project.id, 'info', `${req.method} ${req.path}`);
        return res.json(payload ?? { ok: true });
      }

      addLog(project.id, 'info', `${req.method} ${req.path}`);
      if (!res.headersSent) return res.status(204).end();
      return;
    } finally {
      pdb.close();
    }
  } catch (error) {
    addLog(project.id, 'error', `Erro API: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

if (clientDist) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

bootAllProjects().then(() => {
  server.listen(port, () => {
    console.log(`NodePanel server running on http://localhost:${port}`);
    console.log('Login padrão: admin@nodepanel.local / admin123');
  });
});



