import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const dbPath = path.join(rootDir, 'database.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initMainDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('api', 'worker', 'app', 'docker')),
      worker_mode TEXT DEFAULT 'manual' CHECK(worker_mode IN ('cron', 'continuous', 'manual')),
      cron_expression TEXT,
      code TEXT NOT NULL,
      api_key TEXT,
      api_secret TEXT,
      auth_enabled INTEGER NOT NULL DEFAULT 1,
      rate_limit INTEGER NOT NULL DEFAULT 120,
      active INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'stopped',
      webhook_enabled INTEGER NOT NULL DEFAULT 0,
      pid INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      package_name TEXT NOT NULL,
      version TEXT,
      installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, package_name),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      version_tag TEXT NOT NULL,
      code TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_env (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      env_key TEXT NOT NULL,
      env_value TEXT NOT NULL,
      is_secret INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, env_key),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'project_user' CHECK(role IN ('full_admin', 'project_user')),
      active INTEGER NOT NULL DEFAULT 1,
      storage_limit_mb REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, project_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      icon_data_url TEXT DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'git' CHECK(source_type IN ('git', 'compose')),
      git_url TEXT DEFAULT '',
      compose_text TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_logs_project_created ON logs(project_id, created_at DESC);
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('storage_limit_mb')) {
    db.prepare('ALTER TABLE users ADD COLUMN storage_limit_mb REAL').run();
  }

  const projectsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get()?.sql || '';
  const needsProjectsTypeMigration = !projectsTableSql.includes("'docker'");

  if (needsProjectsTypeMigration) {
    const migrateProjectsType = db.transaction(() => {
      db.exec(`
        ALTER TABLE projects RENAME TO projects_old;

        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          type TEXT NOT NULL CHECK(type IN ('api', 'worker', 'app', 'docker')),
          worker_mode TEXT DEFAULT 'manual' CHECK(worker_mode IN ('cron', 'continuous', 'manual')),
          cron_expression TEXT,
          code TEXT NOT NULL,
          api_key TEXT,
          api_secret TEXT,
          auth_enabled INTEGER NOT NULL DEFAULT 1,
          rate_limit INTEGER NOT NULL DEFAULT 120,
          active INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'stopped',
          webhook_enabled INTEGER NOT NULL DEFAULT 0,
          pid INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO projects (
          id, name, slug, description, type, worker_mode, cron_expression, code,
          api_key, api_secret, auth_enabled, rate_limit, active, status,
          webhook_enabled, pid, created_at, updated_at
        )
        SELECT
          id, name, slug, description, type, worker_mode, cron_expression, code,
          api_key, api_secret, auth_enabled, rate_limit, active, status,
          webhook_enabled, pid, created_at, updated_at
        FROM projects_old;

        DROP TABLE projects_old;
        CREATE INDEX IF NOT EXISTS idx_logs_project_created ON logs(project_id, created_at DESC);
      `);
    });

    migrateProjectsType();
  }

  const hasProjectsOldReferences = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%projects_old%'")
    .all();

  if (hasProjectsOldReferences.length) {
    const repairBrokenProjectForeignKeys = db.transaction(() => {
      db.pragma('foreign_keys = OFF');

      db.exec(`
        CREATE TABLE IF NOT EXISTS logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          level TEXT NOT NULL DEFAULT 'info',
          message TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT INTO logs_new (id, project_id, level, message, metadata, created_at)
        SELECT id, project_id, level, message, metadata, created_at FROM logs;
        DROP TABLE logs;
        ALTER TABLE logs_new RENAME TO logs;

        CREATE TABLE IF NOT EXISTS project_dependencies_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          package_name TEXT NOT NULL,
          version TEXT,
          installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, package_name),
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT INTO project_dependencies_new (id, project_id, package_name, version, installed_at)
        SELECT id, project_id, package_name, version, installed_at FROM project_dependencies;
        DROP TABLE project_dependencies;
        ALTER TABLE project_dependencies_new RENAME TO project_dependencies;

        CREATE TABLE IF NOT EXISTS project_versions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          version_tag TEXT NOT NULL,
          code TEXT NOT NULL,
          author TEXT NOT NULL DEFAULT 'admin',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT INTO project_versions_new (id, project_id, version_tag, code, author, created_at)
        SELECT id, project_id, version_tag, code, author, created_at FROM project_versions;
        DROP TABLE project_versions;
        ALTER TABLE project_versions_new RENAME TO project_versions;

        CREATE TABLE IF NOT EXISTS project_env_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          env_key TEXT NOT NULL,
          env_value TEXT NOT NULL,
          is_secret INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, env_key),
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT INTO project_env_new (id, project_id, env_key, env_value, is_secret, updated_at)
        SELECT id, project_id, env_key, env_value, is_secret, updated_at FROM project_env;
        DROP TABLE project_env;
        ALTER TABLE project_env_new RENAME TO project_env;

        CREATE TABLE IF NOT EXISTS user_projects_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, project_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT INTO user_projects_new (id, user_id, project_id, created_at)
        SELECT id, user_id, project_id, created_at FROM user_projects;
        DROP TABLE user_projects;
        ALTER TABLE user_projects_new RENAME TO user_projects;
      `);

      db.exec('DROP TABLE IF EXISTS projects_old;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_logs_project_created ON logs(project_id, created_at DESC);');
      db.pragma('foreign_keys = ON');
    });

    repairBrokenProjectForeignKeys();
  }
}

export function nowIso() {
  return new Date().toISOString();
}
