import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { config } from '../utils/config';
import { AppError } from '../utils/response';

const execFileAsync = promisify(execFile);

/** Neon pooler hosts often fail with pg_dump — prefer the direct endpoint. */
function databaseUrlForDump(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.hostname.includes('-pooler.')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
  }
  url.searchParams.delete('channel_binding');
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }
  return url.toString();
}

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    '-',
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
  ].join('');
}

class BackupService {
  private dir() {
    return config.backup.dir;
  }

  async ensureDir() {
    await fs.mkdir(this.dir(), { recursive: true });
  }

  async list() {
    await this.ensureDir();
    const entries = await fs.readdir(this.dir(), { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && /\.(dump|sql|gz)$/i.test(e.name))
        .map(async (e) => {
          const full = path.join(this.dir(), e.name);
          const stat = await fs.stat(full);
          return {
            filename: e.name,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString(),
            path: full,
          };
        }),
    );
    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      backupDir: this.dir(),
      hostHint: config.backup.hostHint,
      backups: files.slice(0, 50),
    };
  }

  async create() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new AppError(500, 'DATABASE_URL is not configured', 'BACKUP_NO_DATABASE');
    }

    await this.ensureDir();
    const filename = `ceylon-crm-${stamp()}.dump`;
    const filepath = path.join(this.dir(), filename);
    const dumpUrl = databaseUrlForDump(databaseUrl);

    try {
      await execFileAsync(
        'pg_dump',
        [dumpUrl, '--no-owner', '--no-acl', '-F', 'c', '-f', filepath],
        {
          timeout: 10 * 60 * 1000,
          maxBuffer: 20 * 1024 * 1024,
        },
      );
    } catch (err: unknown) {
      const e = err as { message?: string; stderr?: string | Buffer; code?: string | number };
      await fs.unlink(filepath).catch(() => undefined);
      if (e.code === 'ENOENT') {
        throw new AppError(500, 'pg_dump is not installed on the server', 'BACKUP_TOOL_MISSING');
      }
      const raw = [e.stderr?.toString?.(), e.message].filter(Boolean).join(' · ') || 'pg_dump failed';
      // Never return connection strings / passwords to the client
      const detail = raw
        .replace(/postgresql:\/\/[^\s]+/gi, 'postgresql://***')
        .replace(/Command failed:.*$/i, '')
        .trim();
      throw new AppError(500, `Database backup failed: ${detail.slice(0, 400)}`, 'BACKUP_FAILED');
    }

    const stat = await fs.stat(filepath);
    return {
      filename,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      path: filepath,
      backupDir: this.dir(),
      hostHint: config.backup.hostHint,
    };
  }
}

export const backupService = new BackupService();
