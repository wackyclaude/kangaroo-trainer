# Setting up Kangaroo Trainer at home

This guide is for a Mac (Apple silicon). Everything runs inside Docker, so nothing except Docker Desktop gets installed on the Mac itself. Plan for about 30 minutes the first time.

## What you'll end up with

- The app running on the Mac, started with one command.
- `https://my-mac.local` (your Mac's own name) working on the iPad and on the Mac, with a padlock.
- A nightly backup of all practice data in `Kangaroo/backups`.

## Your folders

Everything lives in one folder, for example `Documents/Kangaroo`:

| Folder | What it is |
| --- | --- |
| `bank/` | The question bank (pictures + `questions.json`). The app can only read it. |
| `kt/` | This code. |
| `kt-data/` | The database (profiles, answers, scores). Created on first start. |
| `backups/` | One backup per day, the last 14 days. Created on first start. |
| `raw/` | The original PDFs. The app doesn't use them. |

## 1. Install Docker Desktop (one time)

1. Go to <https://www.docker.com/products/docker-desktop/> and download **Docker Desktop for Mac with Apple silicon**.
2. Open the downloaded `.dmg` and drag Docker into Applications.
3. Open Docker from Applications. Accept the terms. You can skip signing in.
4. In Docker Desktop **Settings → General**, tick **Start Docker Desktop when you sign in to your computer**.
5. Wait until the whale icon in the menu bar stops animating.

## 2. Start the app (first time)

Open **Terminal** (Applications → Utilities) and paste these lines one at a time:

```sh
cd ~/Documents/Kangaroo/kt
cp .env.example .env
docker compose up -d --build
```

- The first build takes a few minutes. Later starts take seconds.
- `.env` already uses the folders above and the example hostname `my-mac.local`. Find your Mac's own name in **System Settings → General → Sharing**, under **Local hostname**, then open `.env` in TextEdit and set `KT_HOSTNAME` to it.
- macOS may ask whether Docker can accept incoming network connections. Click **Allow**, so the iPad can reach it.

Check it's running:

```sh
docker compose ps
```

Both `app` and `caddy` should say `running` (or `healthy`).

## 3. Get the one-time setup code

```sh
docker compose logs app | grep FIRST-TIME
```

You'll see a 6-digit code. You need it once, to create the parent profile.

## 4. Trust the app's certificate on the Mac (one time)

The app uses HTTPS with its own private certificate authority (made by Caddy on your Mac). Each device needs to trust it once.

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ~/Desktop/kangaroo-root.crt
security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/Desktop/kangaroo-root.crt
```

Don't double-click the `.crt` file. On recent macOS versions that often fails with *"Error: -25294"* (Keychain Access can't find the keychain it tries to use). The command above avoids that.

1. macOS asks for your Mac password (sometimes twice). This adds the certificate to your **login** keychain and marks it as trusted, in one step.
2. To check: open **Keychain Access**, choose **login** on the left, search for **Caddy Local Authority** and open it. Under **Trust** it should say **Always Trust**.

3. Open `https://localhost` in Safari. You should see the setup screen with no warning.
4. Enter the setup code, a nickname, an avatar and a **6–12 digit parent PIN**. Keep this PIN to yourself.
5. In **Parent corner**, tap **Add a student**: nickname, avatar, grade, birth year and a **4-digit PIN**.

## 5. Set up the iPad (one time)

1. AirDrop `kangaroo-root.crt` from the Desktop to the iPad (or email it to yourself).
2. On the iPad: **Settings → Profile Downloaded → Install** (enter the iPad passcode).
3. Then **Settings → General → About → Certificate Trust Settings**, and turn on **Caddy Local Authority**.
4. In Safari, open `https://<your Mac's name>.local`. There should be no warning.
5. Tap **Share → Add to Home Screen**, so it opens like an app, with Roo the kangaroo as its icon. If you added it before this update, remove the old icon and add it again to get the new one.

The iPad must be on the same Wi-Fi as the Mac, and the Mac must be awake.

## Everyday use

- **Start:** nothing to do. Docker starts with the Mac, and the app starts with Docker.
- **Stop:** `docker compose down` (in the `kt` folder). Your data stays.
- **Monthly security refresh:** `docker compose build --pull`, then `docker compose up -d`. This fetches the latest patched base image even when the code hasn't changed.
- **Update** after new code arrives: `git pull`, then `docker compose up -d --build`. The iPad app picks up the new version the next time it is opened (close it fully and reopen if it looks old).
- **See what's happening:** `docker compose logs -f app` (Ctrl-C to stop watching).

## Backups and restore

- A copy of the database is written to `Kangaroo/backups` once a day. The last 14 days are kept.
- To restore one:

  ```sh
  docker compose down
  cp ../backups/kt-YYYY-MM-DD.db ../kt-data/kt.db
  rm -f ../kt-data/kt.db-wal ../kt-data/kt.db-shm
  docker compose up -d
  ```

## Security, in short

- Only Caddy is reachable from the network; the app container has no open ports.
- Never set up port forwarding on your router for this. The app is meant for the home network only.
- Both containers run with almost no Linux permissions. The app runs as a normal user, and its disk is read-only apart from the data folders.
- PINs are stored only as Argon2id hashes. 5 wrong PINs lock a profile (5 minutes for students, 15 for the parent).
- The parent is signed out after 30 minutes of no activity.
- No analytics, nothing loaded from the internet, and the question bank never goes into git.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| `docker: command not found` | Docker Desktop isn't running. Open it and wait for the whale icon. |
| The iPad says "Safari can't connect" | Same Wi-Fi? Mac awake? Try `https://` plus the Mac's IP address (System Settings → Wi-Fi → Details). |
| Certificate warning on the iPad | Redo step 5.3 (Certificate Trust Settings). |
| "Unable to import … Error: -25294" on the Mac | Use the `security add-trusted-cert` command in step 4 instead of double-clicking the certificate. |
| Certificate warning on the Mac after step 4 | Quit Safari or Chrome fully (Cmd-Q) and open it again; browsers keep old certificate decisions until restarted. |
| Ports 80/443 already in use | Another web server is running on the Mac. Stop it, or ask Claude to switch ports. |
| Forgot the parent PIN | In the `kt` folder: `docker compose exec app /nodejs/bin/node dist/server/server/tools/reset-parent-pin.js NEWPIN` (6–12 digits). |
