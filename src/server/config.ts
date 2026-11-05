import path from "node:path";

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes"].includes(v.toLowerCase());
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  contentDir: string;
  backupDir: string;
  webDir: string;
  cookieSecure: boolean;
  setupCode: string | undefined;
  publicHosts: string[];
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = process.cwd();
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "127.0.0.1",
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, "data")),
    contentDir: path.resolve(env.CONTENT_DIR ?? path.join(root, "content")),
    backupDir: path.resolve(env.BACKUP_DIR ?? path.join(root, "data", "backups")),
    webDir: path.resolve(env.WEB_DIR ?? path.join(root, "dist", "web")),
    // Secure cookies need HTTPS. Only switch this off for local development.
    cookieSecure: bool(env.COOKIE_SECURE, true),
    setupCode: env.SETUP_CODE || undefined,
    // Comma-separated hostnames the app is also reached at (behind CloudFront the Host header is the server's own name).
    publicHosts: (env.PUBLIC_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
