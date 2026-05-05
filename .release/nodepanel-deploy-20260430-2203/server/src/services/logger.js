import { db } from './database.js';

let ioRef = null;

export function setSocketServer(io) {
  ioRef = io;
}

export function streamLogs(projectId, payload) {
  if (!ioRef) return;
  ioRef.to(`project:${projectId}`).emit('project:log', payload);
  ioRef.emit('log', payload);
}

export function addLog(projectId, level, message, metadata = null) {
  const stmt = db.prepare('INSERT INTO logs (project_id, level, message, metadata) VALUES (?, ?, ?, ?)');
  const info = stmt.run(projectId, level, message, metadata ? JSON.stringify(metadata) : null);

  const row = db
    .prepare('SELECT id, project_id as projectId, level, message, metadata, created_at as createdAt FROM logs WHERE id = ?')
    .get(info.lastInsertRowid);

  const payload = {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };

  streamLogs(projectId, payload);
  return payload;
}
