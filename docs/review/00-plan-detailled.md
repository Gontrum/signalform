# 00 — Detaillierter Umsetzungsplan

Grundlage: `01-code.md` (Backend/Architektur), `02-ui.md` (Frontend/A11y),
`03-harness.md` (Claude-Code-Konfiguration). Zusätzlich zum reinen Lesen der
drei Reports wurde jeder einzelne Befund gegen den aktuellen `HEAD`
(`git log`, gezielte `grep`s, ein frischer `pnpm run check:dupes`-Lauf,
Dateiinhalte) verifiziert — nicht bloß aus den Reports übernommen. Grund:
zwischen dem Schreiben von `03-harness.md` (24.07., 15:14) und dem Schreiben
von `01-code.md`/`02-ui.md` (25.07., 08:14/08:35) liegen mehrere Commits, die
einen erheblichen Teil der Harness-Befunde bereits beheben. Ohne diesen
Abgleich hätte dieser Plan Arbeit empfohlen, die bereits erledigt ist.

---

## 0. Status-Abgleich gegen HEAD (Voraussetzung für alles Folgende)

**`03-harness.md` ist zu ~80 % bereits erledigt.** Zwischen dem Report und
heute liegen sechs gezielte Fix-Commits:

| Befund (03-harness)                           | Fix-Commit                                                                         | Verifiziert                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| §1.1 AGENTS.md nie geladen                    | `3d1776d1 fix(claude): load AGENTS.md automatically via CLAUDE.md`                 | `CLAUDE.md:3` = `@AGENTS.md`; `packages/{frontend,backend,shared}/CLAUDE.md` sind Symlinks auf `AGENTS.md`                        |
| §1.2 kein `.mcp.json` für context7            | `0956ec80 feat(claude): add safety/verification hooks, pin MCP and LSP plugins`    | `.mcp.json` existiert, `enabledMcpjsonServers: ["context7"]` in `settings.json`                                                   |
| §1.3 LSP-Marketplace nicht committet          | `0956ec80` (s. o.)                                                                 | `extraKnownMarketplaces.signalform-plugins` + `typescript-lsp@signalform-plugins`/`vue-lsp@signalform-plugins` in `settings.json` |
| §1.4 redundante context7-Zeile in CLAUDE.md   | `0956ec80` (s. o.)                                                                 | `CLAUDE.md`-MCP-Sektion enthält nur noch `github`/`playwright`                                                                    |
| §2.1 `verify.sh` wirkungslos                  | `0956ec80` (s. o.)                                                                 | `verify.sh` prüft `$STATUS`, `exit 2` bei Fehler statt unbedingtem `exit 0`                                                       |
| §2.2a fehlender pnpm-SessionStart-Hook        | `0956ec80` (s. o.)                                                                 | `check-pnpm.sh` existiert, als `SessionStart`-Hook registriert                                                                    |
| §2.2b fehlendes Reviewer-Gate                 | `0956ec80` (s. o.)                                                                 | `require-review.sh` existiert, als `PreToolUse`-Bash-Hook registriert, `reviewer.md` schreibt den Marker                          |
| §3.1 Testdatei-Sibling-Regel fehlt            | `d0e662ff docs(agents): dedupe FCIS rules, generalize testing section, fix drift`  | `AGENTS.md` enthält die 20-KB-Sibling-File-Regel                                                                                  |
| §3.3 `check:arch`/`check:cycles`-Dopplung     | (zwischen den Commits)                                                             | `package.json` enthält nur noch `check:arch`, kein `check:cycles`                                                                 |
| §3.2 knip/jscpd nicht maschinenlesbar         | `b414b5e0`/`0956ec80`                                                              | `check:dead` = `knip --reporter json`; `.jscpd.json.reporters` enthält `"json"`                                                   |
| §4.1 Review-Workflow nicht gekapselt          | `5cfcf2f0 feat(claude): add /repo-review command`                                  | Skill `repo-review` existiert (hat diese drei Reports erzeugt)                                                                    |
| §4.2 `reviewer.md` hinter eigenem Gate zurück | `73d69ba0 fix(claude): bake test runs into core-dev/shell-dev, sync reviewer gate` | `reviewer.md` läuft `pnpm run precommit`                                                                                          |
| §4.3 Redundanz Skill/AGENTS.md-Tabelle        | `d0e662ff` (s. o.)                                                                 | `AGENTS.md` verweist nur noch auf `.claude/skills/new-tidal-feature/SKILL.md`                                                     |
| §5 kein `pnpm test` in Subagent-DoD           | `73d69ba0` (s. o.)                                                                 | `core-dev.md`/`shell-dev.md` verlangen beide `pnpm test`                                                                          |

**Noch offen aus `03-harness.md`** (fließt unten in Quick Wins/Completeness ein):
jq-Fail-open in `guard.sh`/`enforce-zones.sh` (§2, Tabelle), `check:dupes`
nicht in `precommit` (überschneidet sich mit 01-code), tote
TODO-Tracking-Sektion (§1.6).

**`01-code.md` und `02-ui.md` sind dagegen vollständig aktuell** — beide
Reports wurden nach allen oben genannten Fix-Commits erstellt und gegen genau
den Code gelesen, der auch heute noch im Baum liegt. Stichprobe zur
Bestätigung: `pnpm run check:dupes` liefert heute **exakt** die im Report
genannten Zahlen (21 Klone, 291 Zeilen/0,97 %, 1899 Token/1,36 %); `grep` auf
`Math.random()` in `seed-merger.ts:117`, `QueueRemovalResult` in
`queue-removal-service.ts:69`, `isBodyRecord` in `queue/shell/route.ts`
(10 Vorkommen) und `_request as FastifyRequest` (`:154,509`) bestätigen den
unveränderten Ist-Zustand. Gleiches für 02-ui: `personal-radio-toggle`/
`scrobbling-toggle` haben weiterhin kein `aria-label`, `AlbumCard.vue` hat
weiterhin `role="button" tabindex="0"` auf dem äußeren Card-Div,
`LibraryView.vue:191` enthält weiterhin `Neu bei Tidal` hart kodiert.

**Wichtige Randnotiz:** Zwei Commits (`066d8061 refactor(backend): reduce
duplicated logic in adapters and feature routes`, `23526f4c refactor(frontend):
reduce duplicated logic in platform/api layer`) behaupten in ihrer
Commit-Message, "die im Review-Toolchain-Baseline geflaggten jscpd-Cluster"
zu schließen. Das trifft nur teilweise zu — siehe Widerspruch 4.6 unten.

---

## 1. Quick Wins (≤5, hohes Wirkung/Aufwand-Verhältnis)

| #   | Befund                                                                                                                         | Quelle                      | Aufwand                                                         | Warum ganz oben                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `guard.sh`/`enforce-zones.sh` fail-open bei fehlendem `jq` — Zonenschutz und Lockfile-Guard schalten sich lautlos komplett ab  | 03, §2-Tabelle (noch offen) | S (`command -v jq \|\| exit 0` am Kopf beider Hooks)            | Der einzige Harness-Befund, der die _gesamte_ restliche Arbeit dieses Plans untergräbt, ist noch nicht behoben — alle anderen Harness-Lücken sind es bereits (siehe §0) |
| 2   | Toggle-Switches ohne Accessible Name (`personal-radio-toggle`, `scrobbling-toggle`)                                            | 02, Befund 1                | S (2-Zeilen-Diff, i18n-Keys existieren bereits)                 | axe `critical`, WCAG 4.1.2 — zwei Kernfunktionen der Settings-Seite sind für Screenreader-Nutzer nicht bedienbar                                                        |
| 3   | Nested Interactive Controls in `AlbumCard.vue`/`AlbumListRow.vue`                                                              | 02, Befund 2                | S/M (Diff liegt vor: Rolle/Tabindex auf Info-Block verschieben) | axe `serious`, aber der größte Blast Radius aller Einzelbefunde — betrifft jede Albumkarte in Library-Grid und -Liste gleichzeitig                                      |
| 4   | Autocomplete-Dropdown: `aria-label` sitzt auf falschem Element (leere Listbox ohne Namen + `aria-label` auf rollenlosem `div`) | 02, Befund 3                | S (2-Zeilen-Diff)                                               | axe `serious` ×2 an einer einzigen Stelle — beide Verstöße durch denselben Fix behoben                                                                                  |
| 5   | Decade-Filter-Chip: Kontrast 3.67:1 + Farbbruch zu den beiden Sibling-Chip-Gruppen                                             | 02, Befund 4                | S (1-Zeilen-Diff: `accent-500` → `neutral-900`)                 | axe `serious`, WCAG 1.4.3, behebt gleichzeitig eine sichtbare Inkonsistenz (screenshot-belegt) in derselben Zeile                                                       |

**Knapp draußen, direkt in Welle 2 statt Top 5** (Begründung liegt in §3):
6× Settings-Sektionsüberschrift-Kontrast (Befund 5) — derselbe Fix wie #5
oben, aber sechsfach wiederholt statt ein Einzeiler; Setup-Wizard-Label
(Befund 6) — identisches Muster; `primary`/`primary-dark` No-Op-Klassen
(Befund 18) — echter Bug, aber rein visuell, keine WCAG-Schwere; 17×
`min-h-[44px]` — mechanisch trivial, aber ohne axe/WCAG-Befund dahinter,
daher kein Quick-Win-Rang trotz simpler Diff.

---

## 2. Strukturelle Befunde (sortiert nach Risiko des Liegenlassens, nicht nach Aufwand)

### 2.1 Destruktive Aktionen in Settings ohne Bestätigung

**Kosten der Behebung:** S/M — bestehendes Tap-zweimal-Pattern aus
`QueueView.vue:72-133` (3000ms Timeout, Label-Wechsel) auf
`SettingsView.vue:410-418` (Last.fm-Disconnect) und `:436-444`
(`user-delete-button`) übertragen. Kein neues Pattern nötig.
**Kosten des Ignorierens:** Echter, potenziell irreversibler Datenverlust
(User-Löschung, Last.fm-Trennung) durch einen versehentlichen Einzelklick —
das einzige Risiko in diesem gesamten Plan mit direktem Nutzerschaden statt
nur Wartungskosten. Wird bei jedem neuen destruktiven Button in Settings
schlimmer, wenn das Pattern nicht jetzt etabliert wird.
**Zerlegbar:** Ja, zwei unabhängige Stellen (User-Delete, Last.fm-Disconnect),
je ein eigener kleiner Commit.

### 2.2 FCIS-Core-Reinheitslücke: `Math.random()` in `seed-merger.ts`

**Kosten der Behebung:** S — `random: () => number`-Parameter injizieren,
Default in der Shell; Pattern existiert im selben Package bereits
(`buildSignature` in `lastfm-auth/core/service.ts`).
**Kosten des Ignorierens:** Untergräbt exakt die Garantie, die `01-code.md`
im Executive Summary als "hart durchgesetzt" bezeichnet und auf die sich
`AGENTS.md`s FCIS-Abschnitt beruft. Eine einzige unentdeckte Ausnahme
relativiert das Vertrauen in die gesamte Grenze — und die Grenze ist
mechanisch (ESLint) genau für diesen Fehlertyp (Zufall/Zeit/globaler Zustand)
_nicht_ abgesichert, nur für `fetch`/`await`/`throw`/Framework-Importe. Der
Test der Funktion (`seed-merger.test.ts:198-215`) kann durch die
Nicht-Determinismus keine konkrete Ausgabe-Reihenfolge prüfen — ein
struktureller blinder Fleck in der Testabdeckung, der bestehen bleibt, bis
dies behoben ist.
**Zerlegbar:** Nein, ein Commit, eine Funktion.

### 2.3 Queue-Endpunkte: Validierungs-Debt (`isBodyRecord` statt Zod)

**Kosten der Behebung:** M — 8 Endpunkte (`/add`, `/add-album`,
`/add-track-list`, `/jump`, `/remove`, `/reorder`, `/clear`,
`/remove-batch`) auf Zod-Schemas umstellen. Mechanisch, kein
Verhaltensunterschied, aber die Menge macht es kein Quick Win.
**Kosten des Ignorierens:** `queue/shell/route.ts` ist mit 579 Zeilen der
größte Endpunkt-Block im Backend und der einzige größere, der nicht dem
17-Routen-Konventionsstandard folgt (Zod an der HTTP-Grenze). Jede neue
Person im Team muss zwei Validierungs-Idiome kennen statt eines; die
schiere Dateilänge macht es schwer, den einen abweichenden Endpunkt zu
finden, wenn wieder einer dazukommt.
**Zerlegbar:** Ja, gut — Endpunkt für Endpunkt, 8 unabhängige kleine Diffs.

### 2.4 `QueueRemovalResult`: eigener, inkompatibler Result-Typ

**Kosten der Behebung:** S/M — auf `Result<QueueProjection \| undefined, LmsError>`
aus `shared` umstellen, Aufrufer in `route.ts` anpassen.
**Kosten des Ignorierens:** Bricht die Komposition mit den Shared-Helfern
(`isOk`/`map`/`flatMap`/`unwrap`) genau an der Stelle, die am meisten davon
profitieren würde (Queue-Mutationen sind der komplexeste Fehlerpfad im
Backend). Jeder künftige Konsument von `handleQueueRemoval` muss die
abweichende Form (`queueProjection` statt `value`, optional statt Pflicht)
neu lernen, statt sich auf den einheitlichen Vertrag verlassen zu können —
ein wiederkehrender Reibungspunkt, kein einmaliger.
**Zerlegbar:** Bedingt — Typänderung und alle Aufrufer hängen zusammen,
aber die Aufrufer-Anpassung selbst ist mechanisch pro Call-Site.

### 2.5 `handleQueueRemoval`: 147-Zeilen-Funktion mit unsichtbarem Fire-and-Forget

**Kosten der Behebung:** M — in benannte Schritte aufteilen (Radio-Kontext
erfassen / LMS-Mutation / Replenish-Trigger), Verhalten unverändert.
**Kosten des Ignorierens:** Zwei zusammengehörige Risiken in einer Funktion:
(a) die Funktion _wirkt_ an der `return`-Stelle fertig, obwohl danach noch
unbeobachtete Async-Arbeit läuft, die Fehler nur loggt (`:165-224`) — ein
neuer Entwickler übersieht das leicht und baut Annahmen auf einem
"abgeschlossenen" Zustand, der es nicht ist; (b) `setSuppressedQueueEnd`
(`:132-158`) mutiert globalen State einer _anderen_ Feature-Shell
(`radio-mode`) aus der `queue`-Feature heraus — eine Fernwirkungs-Kopplung,
die am Funktionsnamen nicht ablesbar ist und bei jeder Änderung an
`radio-mode` unbemerkt brechen kann.
**Zerlegbar:** Ja — die drei benannten Schritte lassen sich unabhängig
extrahieren, Regressionsschutz über den bestehenden Test der Datei.

### 2.6 21 jscpd-Klone: `genre-radio`/`loved-radio`, `tidal-routes`/`queue`, `lastfm-client`-Selbstklone

**Kosten der Behebung:** M — gemeinsame Blöcke extrahieren; für
`lastfm-client.ts` und `lms-client` teilweise bereits durch `066d8061`
angefangen (siehe Widerspruch 4.6), aber die vom Report konkret genannten
Cluster (`genre-radio/shell/route.ts` ↔ `loved-radio/shell/route.ts`,
`playback/tidal-routes.ts` ↔ `queue/shell/route.ts`) sind mit dem heutigen
`check:dupes`-Lauf **verifiziert unverändert** vorhanden.
**Kosten des Ignorierens:** Wer eine der beiden Radiomodus-Routen ändert,
muss wissen, dass die andere synchron mitgepflegt werden muss — das steht
nirgends dokumentiert, nur in der Code-Duplikation selbst. Bei
`tidal-routes.ts`/`queue/route.ts` (LMS-Fehlerbehandlung nach
Queue-Mutationen) verstärkt sich das Risiko mit Befund 2.3 — der Ausreißer
bei der Body-Validierung ist derselbe Ausreißer bei der Duplikation.
**Zerlegbar:** Ja, pro Cluster-Paar unabhängig; kleinster Teil davon
(`App.spec.ts` ↔ `HomeView.spec.ts`, 13 Zeilen) ist trivial und kann isoliert
zuerst gehen.

### 2.7 `isRecord`/`isBodyRecord`: identisches Prädikat, 6+ unabhängige Implementierungen

**Kosten der Behebung:** S pro Stelle, aber ~6-8 Dateien
(`lastfm-auth/shell/route.ts`, `search/shell/route.ts`,
`adapters/lastfm-client/client.ts`, `adapters/fanart-client/client.ts`,
`adapters/lms-client/execute.ts` [bereits `export`et], `adapters/lms-client/library.ts`,
plus `queue/shell/route.ts` und `playback/shell/tidal-routes.ts` mit dem
body-spezifischen `isBodyRecord`) — genau der Fall "viele Dateien berührt",
der laut Aufgabenstellung strukturell statt nach Aufwand einsortiert wird,
obwohl jede Einzeländerung trivial ist.
**Kosten des Ignorierens:** Kein Ort im Code ist laut Boundary-Konfiguration
für geteilte technische Helfer vorgesehen (`shared-technical`-Elemente sind
in `packages/backend/eslint.config.js:16-24` explizit aufgezählt — ein
`is-record.ts` fehlt dort) — jede neue Feature-Datei, die einen Body-Typ
prüfen muss, wird das Prädikat mit hoher Wahrscheinlichkeit ein neuntes Mal
schreiben statt zu importieren, weil es nichts zu importieren gibt.
**Zerlegbar:** Ja, sehr gut — auf die bereits exportierte Version in
`execute.ts` konsolidieren, Datei für Datei.

### 2.8 Frontend-Design-Token-Drift (Farben, Spacing, Shadow, Motion, Z-Index, rohes CSS)

**Kosten der Behebung:** L, aber in klar trennbare Migrationsschritte
zerlegbar (siehe unten) — kein Redesign, reines Konsolidieren auf bereits
vorhandene Tokens.
**Kosten des Ignorierens:** Der mit Abstand größte Einzelbefund im ganzen
Audit nach Flächenwirkung: 165 Off-Palette-Farbnutzungen (15 Dateien), 17×
`min-h-[44px]` statt `min-h-11`, ~18 arbiträre Spacing-Werte, 7 arbiträre
Font-Size-Werte (4 Dateien), 13 rohe/arbiträre Box-Shadow-Werte (3 Dateien),
12 Motion/Duration-Ausreißer außerhalb der 200/300-Skala (4 Dateien, plus
`MainNavBar.vue`s `transition-all` ganz ohne Duration), 3 konkurrierende
Fokus-Ring-Konventionen, eine fehlende Z-Index-Skala (4 Werte, 14 Dateien,
ein `z-[60]`-Ausreißer), und zwei Dateien mit rohem `<style scoped>`-CSS
(`ProgressBar.vue`, `VolumeControl.vue`) statt Tailwind-Utilities. Jede neue
Komponente kopiert mit hoher Wahrscheinlichkeit eines der bestehenden
Off-Token-Muster, statt den kanonischen Wert zu nutzen — die Drift wächst
strukturell weiter, nicht nur historisch.
**Zerlegbar:** Ja, gut — pro Kategorie unabhängig migrierbar, reiner
Utility-Swap ohne Verhaltensänderung; sinnvolle Reihenfolge unten in Welle 3.

### 2.9 UI-Pattern-Duplikation (Spinner, Empty-State, Error-Banner, Play/Queue-Duo, Popover)

**Kosten der Behebung:** M/L — jeweils auf ein bereits im Code vorhandenes
Zielmuster konsolidieren (5× Loading-Spinner, 4× Empty-State, 7×
Error-Banner-Variante, 5× Play/Queue-Button-Duo, 2× Popover-mit-Backdrop);
kein neues Pattern erfinden, nur bestehende zusammenführen.
**Kosten des Ignorierens:** Strukturell unsichtbar für Tooling — siehe
Widerspruch 4.3: `check:dupes` (jscpd) erkennt token-identische Klone, diese
Funde sind aber überwiegend _unterschiedlich implementierte_ Varianten
derselben Idee. Selbst nach Behebung von 2.6 bleibt diese Kategorie
komplett ungeschützt vor weiterem Wachstum — es gibt keinen automatisierten
Mechanismus, der eine sechste Spinner-Variante verhindert.
**Zerlegbar:** Ja, jedes der fünf Pattern-Paare ist unabhängig migrierbar.

### 2.10 `check:dupes` ist nicht Teil von `precommit`

**Kosten der Behebung:** S — Script-Zeile hinzufügen; die Schwelle muss
dabei zunächst auf den Ist-Wert geratcht werden (siehe Widerspruch 4.1),
sonst bricht jeder Commit sofort.
**Kosten des Ignorierens:** Der einzige Mechanismus, der 2.6 (und teilweise
2.9, mit der in 4.3 genannten Einschränkung) automatisiert verhindern
könnte, läuft nie automatisch — genau deshalb konnten sich die 21 Klone
unbemerkt ansammeln. Ohne diesen Fix bleibt jede Behebung von 2.6 nur eine
Momentaufnahme, keine dauerhafte Garantie.
**Zerlegbar:** Nein, ein Commit — aber siehe 4.1 für die Ratchet-Sequenzierung.

### 2.11 Landmark-Struktur uneinheitlich zwischen Routen

**Kosten der Behebung:** M — Layout-Entscheidung nötig (alle Routen durch
`AppLayout` wrappen ODER ein gemeinsames `<main>` einführen), kein
Ein-Zeilen-Diff.
**Kosten des Ignorierens:** Nur Home (`/`) hat `main`+`navigation`+
`complementary`; Library/Queue/Settings/Setup haben kein `main`-Landmark.
Kein axe-`wcag2*`-Verstoß (Landmark-Regeln sind `best-practice`-getaggt),
aber beeinträchtigt Landmark-basierte Screenreader-Navigation
("springe zum Hauptinhalt") auf 4 von 6 auditierten Routen — eine
verifizierte, direkt beobachtbare strukturelle Inkonsistenz.
**Zerlegbar:** Nein wirklich sinnvoll — die Entscheidung selbst (welches
der beiden Muster wird Standard) muss vor jeder Einzeländerung stehen,
sonst entsteht ein drittes Muster.

---

## 3. Vollzähligkeitsprüfung

### 3a. Bereits erledigt (verifiziert gegen HEAD, siehe §0)

14 von 3-harness.md's 15 nummerierten Befunden — Details und Fix-Commits in
der Tabelle in §0. Nicht "erledigt", sondern reine Warnung ohne Diff-Vorschlag:
§4.4 (Warnung vor einem neuen Code-Health-Subagent) — dazu mehr in §6.

### 3b. Zurückgestellt mit Begründung (nicht in §1 oder §2)

**Aus `01-code.md`:**

- **`_request as FastifyRequest`-Cast prüfen/entfernen** (`queue/shell/route.ts:154,509`):
  Der Report selbst verifiziert nicht mit `tsc`, ob der Cast bei Entfernung
  wirklich folgenlos bleibt. Braucht einen kurzen Spike (`tsc`-Check), bevor
  er zu einem Commit wird — geht dann im selben Zug wie 2.3 (Zod-Migration
  derselben Datei) mit, kein eigener Wellenplatz nötig.
- **`networkInterfaces()`-Cast in `discovery.ts`**: Report selbst stuft das
  als "praktisch unkritisch" ein (Subset der echten Node-Felder ist sicher);
  einzige echte OS-API-Grenze im Repo, aber ohne aktiven Bug. Niedrige
  Priorität, kein Wellenplatz — kann mitgehen, wenn `discovery.ts` ohnehin
  aus anderem Grund angefasst wird.

**Aus `02-ui.md`:**

- **Zwei unabhängige `aria-live`-Regionen** (Befund 19): Report stuft dies
  explizit als Geschmacksfrage ein — beide funktionieren korrekt, kein Bug.
- **Kein `navigator.mediaSession`-Handler** (Befund 20): Feature-Lücke, kein
  Konsistenz-Bug, außerhalb des Scopes aller drei Reviews.
- **Fokus-Ring: 3 konkurrierende Konventionen** (Text-Abschnitt
  "Pattern-Inkonsistenzen", nicht in der nummerierten Backlog-Tabelle):
  inhaltlich dieselbe Ursache wie 2.8 (Design-Token-Drift) — dort mit
  aufgenommen statt als eigener Punkt geführt.
- **Arbitrary Spacing (~18 Stellen), Arbitrary Font-Size (7 Stellen),
  Box-Shadow raw (13 Stellen), Motion/Duration (12 Stellen), Z-Index-Skala**:
  alle Teil der Design-Token-Tabelle in `02-ui.md`, aber nicht einzeln in der
  nummerierten Backlog-Tabelle geführt — kollektiv unter 2.8 zusammengefasst,
  weil dieselbe Ursache und derselbe Migrationsweg gilt.

**Aus `03-harness.md`:**

- **§1.6 Tote TODO-Tracking-Sektion** (`AGENTS.md:115-122`): bedingt
  formuliert ("If a TODO.md exists"), also nicht falsch, nur aktuell
  wirkungslos, weil keine `TODO.md` existiert. Kosten des Ignorierens sind
  null (niemand liest eine Bedingung, die nie zutrifft); Kosten der
  Behebung wären auch null (Zeile entfernen) — aber genau deshalb ohne
  Dringlichkeit. Bleibt liegen, bis entweder eine `TODO.md`-Konvention
  tatsächlich eingeführt wird (dann bleibt die Sektion) oder jemand die
  Datei aus anderem Anlass aufräumt.
- **§4.4 Warnung vor neuem Code-Health-Subagent**: kein offener Befund mit
  Diff, sondern eine Warnung vor einer _hypothetischen_ künftigen Aktion.
  Siehe §6.

---

## 4. Widersprüche und Überschneidungen

### 4.1 Sequenzierungs-Konflikt: `check:dupes` in `precommit`

`01-code.md` schlägt vor, `check:dupes` (jscpd) in `precommit` aufzunehmen.
Verifiziert: `.jscpd.json`s `threshold` steht heute noch auf `0`, und ein
`pnpm run check:dupes`-Lauf schlägt mit `exit 1` fehl (21 Klone verletzen
die 0%-Schwelle). Würde man den Vorschlag unverändert umsetzen, wäre
`pnpm run precommit` — und damit `.husky/pre-commit` — ab sofort für jeden
Commit rot, bis alle 21 Klone (Welle 3) behoben sind. Auflösung: Schwelle
beim Einbau zunächst auf den Ist-Wert ratchen (0,97 % bzw. 21 Klone als
Obergrenze), erst nach Behebung von 2.6 auf 0 % verschärfen.

### 4.2 "Hart durchgesetzt" vs. lautlos abschaltbar — noch immer offen

`01-code.md`s Executive Summary: _"Die FCIS-Grenze ist über
eslint-plugin-boundaries + dependency-cruiser tatsächlich hart durchgesetzt."_
Das stimmt für den **committeten** Code (0 Verstöße, per ESLint/depcruise,
läuft in CI unabhängig von `jq`). Aber der einzige Schutz, der _während_
einer Session sofort warnt statt erst bei Push/CI — `enforce-zones.sh` —
kann bei fehlendem `jq` lautlos komplett ausfallen. Anders als die meisten
Harness-Befunde (§0) ist dieser **nicht** durch die jüngsten Commits behoben
— verifiziert: kein `command -v jq` in `guard.sh` oder `enforce-zones.sh`.
Beide Aussagen sind für ihren Scope korrekt, aber nebeneinander gelesen
suggeriert der Report eine Robustheit, die nur so lange gilt, wie
ESLint/CI tatsächlich vor jedem Merge laufen — der Editier-Zeitpunkt-Schutz
selbst hat ein bekanntes, unbehobenes Loch.

### 4.3 `check:dupes` ist strukturell blind für UI-Musterdrift

`01-code.md` (jscpd, token-identische Klone) und `02-ui.md` (5× Spinner, 4×
Empty-State, 7× Error-Banner usw., überwiegend _unterschiedlich
implementierte_ Varianten) belegen dieselbe Grunderkrankung —
Copy-Paste statt Extraktion — mit unterschiedlichen Werkzeugen. Selbst nach
Behebung von 4.1/2.6/2.10 wird `check:dupes` **keinen** der ~15
UI-Pattern-Funde aus 02-ui fangen. Tooling-Lücke, die im Plan (2.9) benannt
bleibt statt stillschweigend als abgedeckt behandelt zu werden.

### 4.4 Frühere Wave-1/Wave-2-Reihenfolge-Begründung ist jetzt überholt (positiv)

Eine frühere Version dieses Plans (`00-plan.md`) begründete "Harness vor UI"
damit, dass ohne `03-harness.md §5` (Testlauf in `core-dev.md`/`shell-dev.md`s
eigener DoD) keiner der UI-Fixes aus Welle 2 automatische
Regressionsabsicherung hätte. Das ist inzwischen erledigt — `core-dev.md`
und `shell-dev.md` verlangen bereits `pnpm test`. Diese spezifische
Blockade-Abhängigkeit existiert nicht mehr; "Harness zuerst" bleibt trotzdem
sinnvoll, aber jetzt primär wegen 4.2 (Zonenschutz-Loch), nicht mehr wegen
fehlender Testgarantie.

### 4.5 Vermeidbare Doppelarbeit bei einem hypothetischen Code-Health-Subagent

`03-harness.md §4.4` warnt, dass ein neuer Subagent für
knip/depcruise/jscpd/type-coverage die vorhandenen Skills
`ponytail-audit`/`simplify` duplizieren würde. Das gilt eins-zu-eins für
Teile von 2.6/2.9 (Klon-Extraktion, Pattern-Konsolidierung) — dieser Plan
routet diese Punkte bewusst über den vorhandenen `simplify`-Skill statt über
eine neue Custom-Aufgabe (siehe §6).

### 4.6 Commit-Anspruch vs. Messung: "geschlossene jscpd-Cluster" sind es nur teilweise

`066d8061` (`refactor(backend): reduce duplicated logic in adapters and
feature routes`) behauptet in der Commit-Message, "die im
Review-Toolchain-Baseline geflaggten jscpd-Cluster" zu schließen —
konkret genannt: `lastfm-client.ts` (fetchJson/postSigned-Vereinheitlichung),
`lms-client` (Schema-Gruppen, Items-Command-Helper), sieben
Feature-`route.ts`-Dateien (validate/respond-Helfer), `radio-mode`
(`emit-helpers.ts`). Ein frischer `pnpm run check:dupes`-Lauf **heute**
zeigt weiterhin exakt **21 Klone, 291 Zeilen (0,97 %), 1899 Token (1,36 %)**
— zahlenmäßig identisch mit dem Ausgangsbefund in `01-code.md`. Die
Zusammensetzung hat sich leicht verschoben (z. B. taucht `fanart-client.ts`
jetzt neu in der Liste auf, `lastfm-client.ts:169` nicht mehr), aber die vom
Report konkret als Top-Funde genannten Cluster —
`genre-radio/shell/route.ts` ↔ `loved-radio/shell/route.ts` (jetzt sogar 5
statt 3 Klon-Paare) und `playback/tidal-routes.ts` ↔ `queue/shell/route.ts`
(weiterhin 4 Klon-Paare) — sind **unverändert vorhanden**. Der Commit hat
also echte, im Report nicht namentlich genannte Duplikation behoben (gut),
aber nicht die beiden strukturell wichtigsten, namentlich benannten Cluster
aus 01-code.md — diese bleiben vollständig Aufgabe von 2.6 in diesem Plan.

---

## 5. Umsetzungsplan in Wellen

Format je Aufgabe: **Aufgabe — Quelle — DoD (Kommando)**.

### Welle 1 — Harness-Restarbeit (klein, da 80 % bereits erledigt, siehe §0)

1. **jq-Fail-open in `guard.sh`/`enforce-zones.sh` schließen** — 03, §2-Tabelle
   DoD: `PATH=/usr/bin:/bin bash .claude/hooks/enforce-zones.sh <<< '{}'; test $? -ne 0 && echo PASS`
2. **`check:dupes` in `precommit` aufnehmen, Schwelle auf Ist-Wert (21 Klone / 0,97 %) ratchen** (siehe Widerspruch 4.1) — 01, Backlog
   DoD: `pnpm run precommit; echo $?` → `0` auf aktuellem HEAD
3. _(optional, kein DoD nötig)_ Tote TODO-Tracking-Sektion in `AGENTS.md` — siehe §3b, bewusst ohne Zwang liegen gelassen.

### Welle 2 — Strukturelle Fixes + verbliebene UI-Bugs

**Backend:**

4. `fisherYatesShuffle`: `Math.random()` injizieren — 2.2
   DoD: `! grep -q 'Math.random' packages/backend/src/features/personal-radio/core/seed-merger.ts && pnpm --filter backend test -- seed-merger`
5. Queue-Endpunkte auf Zod umstellen — 2.3
   DoD: `! grep -q 'isBodyRecord' packages/backend/src/features/queue/shell/route.ts && pnpm --filter backend test -- queue`
6. `_request as FastifyRequest`-Cast prüfen/entfernen (im selben Zug wie 5) — 3b
   DoD: `! grep -q '_request as FastifyRequest' packages/backend/src/features/queue/shell/route.ts && pnpm --filter backend type-check`
7. `QueueRemovalResult` auf `Result<QueueProjection \| undefined, LmsError>` umstellen — 2.4
   DoD: `! grep -rq 'QueueRemovalResult' packages/backend/src/features/queue/shell/queue-removal-service.ts && pnpm --filter backend type-check`
8. `handleQueueRemoval` aufteilen — 2.5
   DoD: `pnpm --filter backend test -- queue-removal-service` grün (Verhalten unverändert)

**Frontend A11y/Bugs (Quick Wins 1-5 zuerst, dann direkt anschließend):**

9. Settings-Sektionsüberschriften + Setup-Wizard-Label: `text-neutral-400` → `600` — 02, Befund 5+6
10. SearchPanel: `<h1>`/`PageHeader`-Phone-Weiche ergänzen — 02, Befund 7
11. Hartkodierten deutschen String durch `t('library.featuredTidal')` ersetzen — 02, Befund 8
12. Undefinierte `primary`-Klassen → `accent` — 02, Befund 18
13. Destruktive Aktionen in Settings auf Tap-zweimal-Pattern umstellen — 2.1 (Risiko-höchster Punkt, bewusst früh in Welle 2)

Gemeinsames DoD für Quick Wins + 9-12: permanente axe-core-Playwright-Regressionsspec
anlegen (ersetzt die temporäre Audit-Spec aus 02-ui), die die drei
auditierten Flows bei 375/768/1440px erneut prüft:
`pnpm --filter frontend exec playwright test e2e/journeys/a11y.spec.ts` →
0 Violations. Test ist Teil der Implementierung (siehe `AGENTS.md`).
DoD für 13 gesondert: neuer/erweiterter Test in `SettingsView.test.ts`, der
Doppel-Tap vor destruktiver Aktion erzwingt.

### Welle 3 — Politur (über den vorhandenen `simplify`-Skill, nicht als Custom-Task, siehe 4.5)

**Backend-Duplikate:**

14. `isRecord`/`isBodyRecord` auf die bereits exportierte Version in `execute.ts` konsolidieren — 2.7
    DoD: `test $(grep -rln '^const isRecord\|^const isBodyRecord\|^export const isRecord' packages/backend/src --include='*.ts' | grep -v test | wc -l) -eq 1`
    (Korrigiert 2026-07-25: die ursprüngliche Formulierung zählte jedes Vorkommen
    des Substrings, inkl. Import-Zeilen aller Aufrufer — bei Konsolidierung per
    Import kann diese Zahl nie auf 1 sinken, unabhängig von der Umsetzungsqualität.
    Die korrigierte Zeile zählt stattdessen Definitionen.)
15. `genre-radio`/`loved-radio` sowie `tidal-routes`/`queue` gemeinsame Klon-Blöcke extrahieren — 2.6
16. `App.spec.ts`/`HomeView.spec.ts`-Test-Setup-Duplikat in gemeinsame Fixture — 01, kleinster Fund
    DoD (14-16 gemeinsam): `pnpm run check:dupes; echo $?` → `0`, danach `.jscpd.json`-Schwelle
    auf den mit 14-16 erreichten Ist-Wert ratchen (nicht auf `0` — 14 Klone aus 2.6/2.7
    bleiben unbeauftragt liegen, siehe Restliste unten): `jq '.threshold' .jscpd.json` → `0.62`
    (Korrigiert 2026-07-25: `0` ist mit dem Umfang von 14-16 nicht erreichbar, ohne
    unbeauftragte Zusatzarbeit an den übrigen 2.6/2.7-Klonen zu leisten — Ratchet folgt
    stattdessen dem in §4.1 selbst etablierten Ist-Wert-Muster.)

**Frontend-Musterkonsolidierung (2.8, 2.9 — Ziel bereits im Code vorhanden):**

17. 5× Loading-Spinner konsolidieren (Ziel: `PlaybackControls.vue`-SVG oder Border-Spin)
18. 4× Empty-State auf `NowPlayingPanel.vue:320-383`-Struktur vereinheitlichen
19. 7× Error-Banner auf `error`/`warning`-Semantic-Token (bereits korrekt in `AutocompleteDropdown.vue`)
20. 5× Play/Queue-Button-Duo auf `AlbumActionButtons.vue` migrieren
21. 2× Popover-mit-Backdrop auf eine gemeinsame Basis
22. 165 Off-Palette-Farbnutzungen → `neutral-*`/`error`/`warning`/`success`
23. 17× `min-h-[44px]` → `min-h-11`
24. Arbitrary Spacing/Font-Size/Box-Shadow/Motion-Ausreißer auf Tailwind-Skala
25. `ProgressBar.vue`/`VolumeControl.vue`: `<style scoped>` → Tailwind-Utilities
26. Z-Index-Skala definieren, `z-[60]`-Ausreißer einordnen
27. 3 konkurrierende Fokus-Ring-Konventionen vereinheitlichen

DoD je Punkt 17-27: `pnpm --filter frontend test` grün (keine Regression).
Grep-Beleg für Reduktion, z. B. für 23:
`! grep -rq 'min-h-\[44px\]' packages/frontend/src && echo PASS`.

### Nicht in eine Welle einsortiert, aber offen (2.11)

28. Landmark-Struktur vereinheitlichen — braucht zuerst eine
    Layout-Entscheidung (`AppLayout` überall vs. gemeinsames `<main>`), dann
    Umsetzung. Kein DoD ohne diese Entscheidung formulierbar — siehe §6.

---

## 6. Was bewusst NICHT gemacht wird

- **Neuer "Code-Health"-Subagent** (03, §4.4): würde `ponytail-audit`/
  `simplify` duplizieren. Welle-3-Dedup-Arbeit läuft stattdessen über den
  vorhandenen `simplify`-Skill (4.5).
- **Neuer Slash-Command für den Review-Workflow selbst** (03, §4.1): bereits
  erledigt — der `repo-review`-Skill existiert und hat diese drei Reports
  erzeugt (§0).
- **Vereinheitlichung der Landmark-Struktur** (2.11) als _Wellenaufgabe_:
  kein WCAG-Pflichtverstoß, braucht eine bewusste Design-Entscheidung
  (welches Muster wird Standard), keinen Diff. In §5 als offener Punkt
  außerhalb der Wellen geführt, nicht stillschweigend fallen gelassen — aber
  auch nicht mit einer erfundenen Entscheidung vorweggenommen.
- **`navigator.mediaSession`/Hardware-Medientasten** (02, Befund 20):
  Feature-Lücke, kein Konsistenz-Bug — außerhalb des Scopes aller drei Reviews.
- **Zwei `aria-live`-Regionen konsolidieren** (02, Befund 19): Report stuft
  das explizit als Geschmacksfrage ein, beide funktionieren korrekt.
- **Tote TODO-Tracking-Sektion in `AGENTS.md`** (03, §1.6): Kosten und Nutzen
  der Behebung sind beide praktisch null — siehe §3b.
- **Vollständige manuelle Zeile-für-Zeile-Durchsicht von `lastfm-client.ts`
  und `type-coverage --detail`-Auflösung der Any-Lücke** (01): Report
  markiert das selbst als nicht abschließend verifiziert; jscpd- bzw.
  type-coverage-Summary-Werte sind ausreichend Signal für die oben gewählten
  Punkte, ein vollständiger manueller Reread liefert keinen zusätzlichen
  Entscheidungswert an dieser Stelle.
- **`networkInterfaces()`-Cast** und **`_request as FastifyRequest`-Cast**
  als eigene Wellenaufgabe: beide niedrige Priorität/unverifizierter Nutzen
  laut Report selbst — siehe §3b, gehen mit an, wenn die jeweilige Datei
  ohnehin aus anderem Grund angefasst wird (6 im Fall des Casts, sonst kein
  eigener Commit).
