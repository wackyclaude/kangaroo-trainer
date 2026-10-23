# Kangaroo Trainer

A kid-friendly web app for practising the W4Kangoeroe **wizSMART** maths competition at home, built for one family and shared as open source.

> Not affiliated with or endorsed by Stichting Wiskunde Kangoeroe. **No contest questions are included.** The past papers are © Stichting Wiskunde Kangoeroe; to use the app you need your own question bank (see below), for private use only.

- **Run it at home:** [docs/SETUP.md](docs/SETUP.md) (a Mac with Docker; the iPad connects over the home network).
- **Security:** [SECURITY.md](SECURITY.md).
- **Licence:** [MIT](LICENSE) for the code. The licence does not cover any contest material.

## What it does

- **Practice:** full past papers (timed, like the contest), focus quizzes per topic, Smart mix, and Fix my mistakes (missed questions come back later).
- **Help levels:** Test (no help), Practice (right or wrong after each answer), Learn (hints and worked steps).
- **Progress:** a level per focus area with trend, speed, a contest-score estimate, a contest countdown and a "contest ready" percentage.
- **Fun:** Roo the kangaroo (an original drawing), stars, streaks, a weekly goal and badges. No comparison with other children.
- **Parent corner:** profiles with PINs, benchmarks, CSV/JSON export, printable papers with an answer sheet.
- **Privacy:** no names, emails or photos; everything stays on your own machine.

## The question bank (not included)

The app reads a folder set by `KT_CONTENT_DIR` with a `questions.json` and an `img/` folder of question pictures. [tests/fixtures/content](tests/fixtures/content) shows the format with three made-up questions. CI fails if anything that looks like contest material is committed (`npm run check:content`).

## How it fits together

- `src/server`: Node 22 + Fastify API, SQLite through Drizzle, Argon2id PINs, server-side sessions.
- `src/web`: React + Vite app, installable on the iPad home screen.
- `src/shared`: types used by both sides.
- `drizzle/`: database migrations (applied automatically at start-up).
- `deploy/Caddyfile` + `docker-compose.yml`: HTTPS on the home network.

## Developing

```sh
npm ci
npm test            # unit + API tests
npm run typecheck
# two terminals:
DATA_DIR=./data CONTENT_DIR=../bank COOKIE_SECURE=false PORT=8080 npm run dev:server
npm run dev:web     # http://localhost:5173
```

The first-time setup code is printed in the server log. Set `SETUP_CODE=…` to choose it yourself in development.
