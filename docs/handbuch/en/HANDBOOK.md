---
title: Plex Auto Remover
subtitle: User Manual
tagline: Smart storage cleanup for your Unraid Plex Media Server
version: v2026.11.1.14.5747
date: 2026-11-20
status: Release
classification: Public
copyright: © 2026 SushiFlux
lang: en
---

## 1. Overview & How It Works

**Plex Auto Remover** keeps your Unraid media drives clean. On a configurable schedule (e.g. every **90 days**), it queries your Plex Media Server and finds movies and TV shows that have not been watched by **any** Plex profile within the threshold.

> [!TIP]
> Playback history is checked globally across all Plex Home and shared user profiles, not just the admin account.

### Main Sections
- **Overview:** Potential disk savings, freed space so far, protected items, and the next scheduled scan.
- **Candidates:** Detected media as a list or poster grid, filterable by library in the sidebar tree and sortable by size, name, or days untouched.
- **Never delete:** Permanent whitelist for favorite titles.
- **Deletion log:** Chronological record of all deletions and dry-run simulations.
- **Settings:** Plex connection, rules, Unraid path mapping, optional Discord webhook reminder, and update channels.

---

## 2. Installation on Unraid

1. Open **Docker** or **Community Applications** in Unraid and install `PlexAutoRemover`.
2. Review the container mappings:
   - **Web UI Port:** `5281` (mapped to container port `8080`).
   - **AppData Config (`/config`):** Point to a cache or pool path (e.g. `/mnt/cache/appdata/plex-auto-remover`) for reliable SQLite performance.
   - **Media Share (`/media`):** Mount your Unraid media share (e.g. `/mnt/user/media`) with Read/Write (`rw`) access.
   - **PUID / PGID:** Default `99` / `100`.
3. Start the container and open `http://<UNRAID-IP>:5281`.

---

## 3. Initial Setup & Plex Token

1. Open **Settings** in the sidebar.
2. Enter your **Plex URL** (e.g. `http://<UNRAID-IP>:32400`).
3. Enter your **Plex Token (`X-Plex-Token`)**:
   1. Open Plex Web and select any movie.
   2. Click **`⋯`** → **Get Info** → **View XML**.
   3. Copy the value after `?X-Plex-Token=` at the end of the opened URL.
4. Click **Save** and **Test connection**.

### Configuring Unraid Path Mapping
To delete files on disk safely, map Plex’s internal paths to this container’s mounted folders:
- Example: Plex reports `/movies/...` and this container mounts `/media/movies` → add mapping `/movies` → `/media/movies`.
- Do the same for TV shows (e.g. `/tv` → `/media/tv`).

> [!WARNING]
> If a mapped path does not exist inside the container, deletion fails safely with an error message without modifying anything.

---

## 4. Reviewing & Deleting Candidates

1. Run your first scan from **Overview → Scan now**.
2. Switch to **Candidates**.
3. Use the sidebar library tree to filter by library (e.g. *Movies*, *Series*, *Anime*).
4. Switch between **List** and **Grid** views and sort by **Size**, **Name**, or **Days untouched**.
5. Select items to delete — the sticky header shows the live count and disk space to be freed.
6. Click **Delete selected** and confirm the dialog.

### Auto-Delete (Optional)
Enable **Auto-delete** under **Settings → Scan Rules & Safety** to delete unprotected findings automatically after scheduled scans. Items on the whitelist, tagged `keep` in Plex, or in excluded libraries remain untouched.

---

## 5. Protection & Updates

- **Never delete:** Click *Never delete* on any candidate to protect it permanently.
- **Plex `keep` label:** Items tagged `keep` or `no-delete` in Plex are skipped automatically.
- **Update Channels:** Choose between **Release** (`:latest`), **Beta** (`:beta`), and **Nightly** (`:nightly`) under **Settings → Update Channel & Version**. Update in Unraid via **Docker → Check for Updates → Update**.
