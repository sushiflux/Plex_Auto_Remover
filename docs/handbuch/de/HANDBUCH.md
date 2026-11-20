---
title: Plex Auto Remover
subtitle: Benutzerhandbuch
tagline: Intelligente Speicherbereinigung für deinen Unraid-Plex-Server
version: v2026.11.1.14.5747
date: 2026-11-20
status: Release
classification: Öffentlich
copyright: © 2026 SushiFlux
lang: de
---

## 1. Übersicht & Funktionsweise

**Plex Auto Remover** hilft dir dabei, deine Festplatten auf dem Unraid-Server sauber zu halten. Die Anwendung fragt regelmäßig deinen Plex Media Server ab und findet Filme und Serien, die seit einem festgelegten Zeitraum (z. B. **90 Tage**) von **keinem** Plex-Profil mehr geschaut wurden.

> [!TIPP]
> Es werden auch alle Mitbenutzer- und Home-Profile (über die globale Plex-Wiedergabe-Historie) berücksichtigt – nicht nur der Admin-Account.

### Hauptbereiche der Oberfläche
- **Übersicht:** Zeigt potenziell frei werdenden Speicherplatz, bereits freigegebenen Speicher, geschützte Titel und den nächsten automatischen Scan.
- **Kandidaten:** Alle erkannten Medien als Liste oder Poster-Kacheln, filterbar im linken Bibliotheks-Baummenü und sortierbar nach Größe, Name oder Tagen ohne Abruf.
- **Nie löschen:** Dauerhafte Ausnahmeliste für Lieblingstitel.
- **Protokoll:** Vollständige Übersicht aller durchgeführten Löschungen und Dry-Run-Simulationen.
- **Einstellungen:** Plex-Verbindung, Prüfregeln, Unraid Pfad-Mapping, optionale Discord-Erinnerung und Update-Kanäle.

---

## 2. Installation auf Unraid

1. Öffne in Unraid den Tab **Docker** oder **Community Applications** und installiere das Template `PlexAutoRemover`.
2. Prüfe die Container-Einstellungen:
   - **Web UI Port:** `5281` (auf Container-Port `8080`).
   - **AppData Config (`/config`):** Auf einen Cache- oder Pool-Pfad legen (z. B. `/mnt/cache/appdata/plex-auto-remover`), damit die SQLite-Datenbank schnell und sicher läuft.
   - **Media Share (`/media`):** Deinen Unraid-Medien-Share (z. B. `/mnt/user/media`) mit Lese-/Schreibrechten (`rw`) einbinden.
   - **PUID / PGID:** Standard `99` / `100`.
3. Starte den Container und öffne die Weboberfläche unter `http://<UNRAID-IP>:5281`.

---

## 3. Ersteinrichtung & Plex-Token

1. Klicke links auf **Einstellungen**.
2. Trage unter **Plex Media Server** deine interne **Plex-URL** ein (z. B. `http://<UNRAID-IP>:32400`).
3. Trage dein **Plex-Token (`X-Plex-Token`)** ein:
   1. Öffne Plex Web im Browser und wähle einen beliebigen Film aus.
   2. Klicke auf das Menü **`⋯`** → **Info abrufen** → **XML anzeigen**.
   3. Kopiere am Ende der geöffneten URL den Wert hinter `?X-Plex-Token=`.
4. Klicke auf **Speichern** und anschließend auf **Verbindung testen**.

### Unraid Pfad-Mapping einrichten
Damit der Container Dateien auf der Festplatte findet und löschen kann, muss er wissen, wie die Pfade aus Plex zu seinen gemounteten Ordnern passen:
- Beispiel: Plex meldet `/movies/...`, im Container liegt der Share unter `/media/movies` → Mapping `/movies` → `/media/movies`.
- Gleiches gilt für Serien (z. B. `/tv` → `/media/tv`).

> [!WARNUNG]
> Ohne passendes Pfad-Mapping bricht der Löschvorgang mit einer Fehlermeldung ab, sodass niemals versehentlich am falschen Ort gelöscht wird.

---

## 4. Kandidaten prüfen & löschen

1. Starte unter **Übersicht** über **Jetzt scannen** einen ersten Scan (oder warte auf den automatischen Lauf).
2. Wechsle links zu **Kandidaten**.
3. Nutze das **Baummenü** unter „Kandidaten“, um nach einzelnen Bibliotheken (z. B. *Filme*, *Serien*, *Anime-Serien*) zu filtern.
4. Wähle oben rechts zwischen **Liste** und **Kacheln** sowie der Sortierung nach **Größe**, **Name** oder **Tagen unberührt**.
5. Hake die Titel an, die weg können – oben siehst du live, wie viele Titel gewählt sind und wie viel Speicherplatz dadurch frei wird.
6. Klicke auf **Auswahl löschen** und bestätige den Sicherheitsdialog.

### Automatisch löschen (optional)
Unter **Einstellungen → Prüfregeln & Sicherheit** kannst du **Automatisch löschen** aktivieren. Dann werden bei jedem geplanten automatischen Scan alle ungeschützten Funde direkt gelöscht – geschützte Titel (*Nie löschen*, Plex-Label `keep`, ausgeschlossene Bibliotheken) bleiben unangetastet.

---

## 5. Schutzmechanismen & Updates

- **Nie löschen:** Klicke bei einem Kandidaten auf *Nie löschen*, um ihn dauerhaft zu schützen.
- **Plex-Label `keep`:** Medien mit dem Label `keep` oder `no-delete` in Plex werden bei Scans automatisch übersprungen.
- **Update-Kanäle:** Unter **Einstellungen → Update-Kanal & Version** wählst du zwischen **Release** (`:latest`), **Beta** (`:beta`) und **Nightly** (`:nightly`). Updates installierst du in Unraid über **Docker → Check for Updates → Update**.
