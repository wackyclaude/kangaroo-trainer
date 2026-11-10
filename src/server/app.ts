import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { Db } from "./db/client.js";
import { COOKIE_NAME, readSession } from "./auth/session.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profiles.js";
import { questionRoutes } from "./routes/questions.js";
import { sessionRoutes } from "./routes/sessions.js";
import { insightRoutes } from "./routes/insights.js";
import { feedbackRoutes } from "./routes/feedback.js";
import "./routes/guards.js";

export interface AppOptions {
  db: Db;
  contentDir: string;
  webDir: string;
  cookieSecure: boolean;
  setupCode: string;
  logLevel?: string;
  /** Extra addresses the app is reached at through a proxy that rewrites Host, e.g. the CloudFront domain. */
  publicHosts?: string[];
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logLevel === "silent" ? false : { level: opts.logLevel ?? "info" },
    trustProxy: "127.0.0.1/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(cookie);
  // The general limit protects the API. Pictures and app files are left out: a printable paper alone loads 24 pictures.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute", allowList: (req) => !req.url.startsWith("/api/") });

  const publicHosts = new Set((opts.publicHosts ?? []).map((h) => h.toLowerCase()));
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req, reply) => {
    // Block cross-site form posts: a state-changing request must come from this same site.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        let originHost = "";
        try {
          originHost = new URL(origin).host;
        } catch {
          /* bad origin */
        }
        if (originHost !== req.headers.host && !publicHosts.has(originHost)) {
          return reply.code(403).send({ error: "bad_origin", message: "This request didn't come from the app." });
        }
      }
    }
    req.user = readSession(opts.db, req.cookies[COOKIE_NAME]);
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    const code = (err as { statusCode?: number }).statusCode;
    const status = code && code < 500 ? code : 500;
    void reply.code(status).send({
      error: status === 429 ? "slow_down" : status < 500 ? "bad_request" : "server_error",
      message: status === 429 ? "Too many tries. Wait a minute and try again." : status < 500 ? "That request wasn't right." : "Something went wrong on the server.",
    });
  });

  app.get("/api/health", async () => ({ ok: true }));
  await authRoutes(app, { db: opts.db, cookieSecure: opts.cookieSecure, setupCode: opts.setupCode });
  await profileRoutes(app, { db: opts.db });
  await questionRoutes(app, { db: opts.db, contentDir: opts.contentDir });
  await sessionRoutes(app, { db: opts.db });
  await insightRoutes(app, { db: opts.db });
  await feedbackRoutes(app, { db: opts.db });

  // The web app (built by Vite). Any unknown non-API path gets index.html.
  const hasWeb = fs.existsSync(path.join(opts.webDir, "index.html"));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: opts.webDir,
      index: ["index.html"],
      wildcard: false,
      setHeaders: (res, filePath) => {
        const name = path.basename(filePath);
        // Built files carry a content hash in their name, so they can be kept for good.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.header("Cache-Control", "public, max-age=31536000, immutable");
        // The service worker, the page and the manifest must always be checked, so updates arrive.
        else if (name === "sw.js" || name === "index.html" || name.endsWith(".webmanifest")) res.header("Cache-Control", "no-cache");
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    const isPage = !/\.[a-z0-9]+(\?|$)/i.test(req.url.split("#")[0] ?? "");
    if (hasWeb && req.method === "GET" && isPage && !req.url.startsWith("/api/") && !req.url.startsWith("/content/")) {
      return reply.header("Cache-Control", "no-cache").type("text/html").sendFile("index.html");
    }
    return reply.code(404).send({ error: "not_found", message: "Nothing here." });
  });

  return app;
}
