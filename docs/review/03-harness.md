# Harness-Audit: Claude-Code-Konfiguration

Auditiert wird die Claude-Code-Konfiguration selbst (CLAUDE.md, AGENTS.md,
`.claude/*`, `.mcp`/`.lsp`, package.json-Scripts), nicht der Anwendungscode.
Keine Datei wurde verändert.

**Kontext vorab:** `.claude/settings.json` sowie drei der vier Hooks
(`guard.sh`, `format.sh`, `verify.sh`) sind laut `git status` unstaged/neu —
nur `enforce-zones.sh` hat Historie (`8cc146d9 chore: consolidate zone
enforcement into a single hook`). Die Befunde unten zu diesen drei Hooks
sind also Bugs in frischem Code, nicht verrottete Altlast.

---

## 1. CLAUDE.md — handlungsleitend oder dekorativ?

### 1.1 Kritischster Befund: AGENTS.md wird von Claude Code gar nicht geladen

`CLAUDE.md:3`:

```
Project rules are in AGENTS.md. This file adds Claude-specific tooling only.
```

Verifiziert gegen die offizielle Doku: **Claude Code lädt `CLAUDE.md`, nicht
`AGENTS.md`.** Es gibt keinen automatischen Import. Das bedeutet:

- `/AGENTS.md` (root) — nie automatisch geladen
- `packages/frontend/AGENTS.md`, `packages/backend/AGENTS.md`,
  `packages/shared/AGENTS.md` — nie automatisch geladen, auch nicht beim
  Bearbeiten von Dateien in diesen Verzeichnissen (das nested-CLAUDE.md-
  Verhalten greift nur bei Dateien, die tatsächlich `CLAUDE.md` heißen)

Damit ist praktisch der gesamte Inhalt von AGENTS.md — FCIS-Regeln im
Detail, Code-Regeln (`no any`, `readonly`, `null` vs. `undefined`), die
Tidal-Anatomie-Tabelle, TODO-Tracking, alle drei package-level Deltas —
für den Hauptkontext unsichtbar, außer das Modell liest die Datei aus
eigenem Antrieb. Das ist keine "vage Formulierung", das ist ein
funktionierendes Delegationsversprechen, das nie eingelöst wird.

Abgemildert wird das nur dort, wo die Kernregeln zusätzlich direkt in
`.claude/agents/*.md` (siehe unten, die werden garantiert geladen, weil sie
der Subagent-Systemprompt sind) oder in ESLint/dependency-cruiser
mechanisch verankert sind. Aber alles, was nur als Prosa in AGENTS.md steht
(Testing-Konventionen pro Layer, Tidal-Anatomie, Namenskonventionen), ist
faktisch totes Gewicht.

**Fix** (Root-Import + Vererbung pro Package via Symlink, damit
package-spezifische Regeln weiterhin nur laden, wenn tatsächlich in diesem
Package gearbeitet wird — nicht alle drei immer):

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -1,6 +1,8 @@
 # Signalform – Claude Code

-Project rules are in AGENTS.md. This file adds Claude-specific tooling only.
+@AGENTS.md
+
+This file adds Claude-specific tooling on top of the rules imported above.
```

```bash
ln -s AGENTS.md packages/frontend/CLAUDE.md
ln -s AGENTS.md packages/backend/CLAUDE.md
ln -s AGENTS.md packages/shared/CLAUDE.md
```

Damit bleibt AGENTS.md als Datei für Codex/andere Tools erhalten, aber
Claude Code lädt Root- und Package-Regeln über den offiziell dokumentierten
Mechanismus (`@import` + nested-CLAUDE.md-Discovery), statt sich auf
"das Modell liest es schon von sich aus" zu verlassen.

### 1.2 `context7` MCP: für diesen User handlungsleitend, für jeden anderen tot

`CLAUDE.md:16`: `Use context7 before implementing any Fastify or Vue API`

Es existiert **kein** `.mcp.json` im Repo und **kein** `enabledPlugins`-
Eintrag für context7 in `.claude/settings.json`. Der MCP-Server ist einzig
über `~/.claude.json` (`mcpServers.context7`, mit persönlichem API-Key)
dieses Users registriert. `shell-dev.md` listet
`mcp__context7__resolve-library-id`/`query-docs` explizit in seinen
`tools:` — für jeden anderen Contributor, der das Repo klont, existieren
diese Tools schlicht nicht, die Regel läuft ins Leere.

`github` und `playwright` sind dagegen über `enabledPlugins` in der
committeten `settings.json` verankert und damit portabel — context7 ist der
Ausreißer.

**Fix** (Server projektweit deklarieren, ohne den persönlichen Key zu
committen):

```diff
+++ b/.mcp.json
+{
+  "mcpServers": {
+    "context7": {
+      "type": "stdio",
+      "command": "npx",
+      "args": ["-y", "@upstash/context7-mcp@latest"],
+      "env": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}" }
+    }
+  }
+}
```

```diff
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@
   "enabledPlugins": {
     "typescript-lsp@claude-plugins-official": true,
     "playwright@claude-plugins-official": true,
     "github@claude-plugins-official": true
-  }
+  },
+  "enabledMcpjsonServers": ["context7"]
 }
```

### 1.3 LSP-Sektion: Aussage stimmt nur auf diesem Rechner

`CLAUDE.md:7`: `TypeScript (vtsls) and Vue (vue-language-server v2) are active.`

Diese beiden Server kommen aus einer **lokalen** Plugin-Marketplace
(`.claude-marketplace/.claude-plugin/marketplace.json`, im Repo
eingecheckt), aber ihre _Aktivierung_ (`typescript-lsp@signalform-plugins`,
`vue-lsp@signalform-plugins`) steht ausschließlich in
`.claude/settings.local.json` — nicht committet, nicht Teil des Repos.
Zusätzlich aktiviert die committete `.claude/settings.json` parallel
`typescript-lsp@claude-plugins-official` — ein **anderes** Plugin mit
identischem Namen aus einer anderen Marketplace. Zwei `typescript-lsp`-
Plugins gleichzeitig aktiv ist mindestens verwirrend, im Zweifel
konfliktbehaftet (welches gewinnt?).

Für jeden Contributor ohne `settings.local.json` mit dieser Registrierung:
vue-lsp existiert gar nicht, typescript-lsp ist die offizielle Variante
(vermutlich tsserver-basiert, nicht vtsls) — die Zeile in CLAUDE.md ist für
sie schlicht falsch.

**Fix** (Marketplace + Plugins ins committete Setup heben, damit die Aussage
für jeden Contributor stimmt; exakte Marketplace-Schema-Keys vor dem
Anwenden gegen die aktuelle Plugin-Doku prüfen, da hier nicht verifiziert):

```diff
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@
+  "extraKnownMarketplaces": {
+    "signalform-plugins": {
+      "source": { "source": "directory", "path": "./.claude-marketplace" }
+    }
+  },
   "enabledPlugins": {
-    "typescript-lsp@claude-plugins-official": true,
+    "typescript-lsp@signalform-plugins": true,
+    "vue-lsp@signalform-plugins": true,
     "playwright@claude-plugins-official": true,
     "github@claude-plugins-official": true
   }
```

### 1.4 Redundante Zeile in CLAUDE.md

`CLAUDE.md:16`, `Use context7 before implementing any Fastify or Vue API` —
identisch (fast wortgleich) dupliziert in `packages/backend/AGENTS.md:10`,
`packages/frontend/AGENTS.md:12` und `shell-dev.md:20`. Da CLAUDE.md's
eigener Agents-Abschnitt (`CLAUDE.md:22-23`) verlangt, dass im Hauptkontext
**nie** Implementierungscode geschrieben wird, kann der Hauptkontext auch
nie selbst eine Fastify/Vue-API implementieren — die Regel adressiert eine
Situation, die laut derselben Datei nicht eintreten darf. Sie gehört
ausschließlich in `shell-dev.md` (wo sie bereits steht und tatsächlich
greift, weil das der garantiert geladene Systemprompt des ausführenden
Agents ist).

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -13,9 +13,8 @@
 ## MCP

-- Use `context7` before implementing any Fastify or Vue API
 - Use `github` MCP to read issues before implementing features
 - Use `playwright` MCP to verify Vue UI behaviour when needed
```

### 1.5 Vererbung frontend/backend/shared — Ergebnis

Inhaltlich widerspruchsfrei (kein Konflikt zwischen den drei
package-AGENTS.md), aber das ist irrelevant, solange 1.1 nicht behoben ist:
es gibt aktuell **keine funktionierende Vererbung**, weil keine der drei
Dateien lädt. Die einzige echte, verifiziert funktionierende
Vererbungsebene sind die zwei pfadgebundenen Regeln
`.claude/rules/core-zone.md` (`paths: ["**/core/**"]`) und `shell-zone.md`
(`paths: ["**/shell/**"]`) — die sind package-agnostisch formuliert und
laden nachweislich beim Berühren passender Pfade. Sie sind inhaltlich
konsistent mit dem, was AGENTS.md behauptet — decken die Kernregel aber
redundant vierfach ab (AGENTS.md-Prosa, `.claude/rules/*.md`,
Agent-Frontmatter, ESLint/dependency-cruiser). Nach Fix 1.1 sollte die
AGENTS.md-Prosa zur zweitrangigen Erklärung werden und `.claude/rules/*.md`

- die mechanische Durchsetzung als Quelle der Wahrheit gelten — nicht
  umgekehrt.

### 1.6 Tote Sektion

`AGENTS.md:115-122` ("TODO Tracking") verweist auf eine `TODO.md`, die im
Repo nicht existiert (`find` bestätigt: keine Datei). Die Sektion ist
bedingt formuliert ("If a TODO.md exists"), also nicht per se falsch, aber
aktuell komplett wirkungslos — niemand prüft je diese Bedingung, weil die
Datei fehlt und nichts sie automatisch anlegt oder darauf hinweist, dass
sie fehlt.

---

## 2. Hooks

| Hook               | Event                   | Verifizierte Fehlerklasse                                                                                                                           | Laufzeit                                                                                   | Degradiert sauber?                                                                                                                                        |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guard.sh`         | PreToolUse Edit\|Write  | Handbearbeitung von `pnpm-lock.yaml` / generierten Verzeichnissen (dist, build, coverage, *.tsbuildinfo, dev-dist, playwright-report, test-results) | <10ms (ein `jq`-Call + bash `case`)                                                        | **Nein** — kein `command -v jq`-Guard; fehlt `jq`, wird `FILE_PATH` leer und der Hook lässt (fail-open) alles durch, ohne Hinweis                         |
| `enforce-zones.sh` | PreToolUse Edit\|Write  | Hauptkontext oder falscher Subagent editiert `core/`/`shell/` direkt                                                                                | <10ms                                                                                      | **Nein** — derselbe fail-open-Fall wie oben: fehlt `jq`, greift keine der beiden `case`-Regeln, der Zonenschutz ist komplett aus, unbemerkt               |
| `format.sh`        | PostToolUse Edit\|Write | Inkonsistente Formatierung einzelner editierter Dateien (rein kosmetisch)                                                                           | 1 Prettier-Subprozess pro Edit (~150–300ms Node-Start)                                     | Ja — `[ -x "$PRETTIER" ]                                                                                                                                  |     | exit 0` |
| `verify.sh`        | Stop                    | **Aktuell: nichts.** Siehe 2.1                                                                                                                      | gemessen: 3.4s für den vollen `pnpm -r run type-check` (inkrementell, tsc/vue-tsc --build) | Teilweise — fehlt `pnpm`, no-op ohne jede Rückmeldung; das ist der dokumentierte, wiederkehrende Fehlerfall auf diesem Rechner (mise/corepack), siehe 2.2 |

### 2.1 `verify.sh` ist aktuell wirkungslos

```
.claude/hooks/verify.sh:11-12
pnpm -r run type-check
exit 0
```

Der Exit-Code von `pnpm -r run type-check` wird nirgendwo geprüft — die
letzte Zeile ist ein unbedingtes `exit 0`. Der Hook läuft bei **jedem**
Stop-Event (auch bei reinen Rückfragen ohne einen einzigen Edit), verbrennt
gemessen ~3.4s CPU, und egal was `type-check` zurückgibt: Claude darf immer
stoppen. Das steht im Gegensatz zu `guard.sh`'s eigenem, korrekt gebautem
`deny()`-Pattern (stderr + `exit 2`) im selben Verzeichnis — die Blaupause
für "richtig" liegt buchstäblich daneben.

Zusätzlich: Der committete Pre-Commit-Hook (`.husky/pre-commit`, `sh -e`)
macht den _gleichen_ Type-Check bereits korrekt blockierend beim Commit.
`verify.sh` in seiner jetzigen Form fügt dem nichts hinzu außer verbrannter
Zeit — es ist Cargo Cult in Reinform: sieht aus wie ein Gate, ist keins.

```diff
--- a/.claude/hooks/verify.sh
+++ b/.claude/hooks/verify.sh
@@ -6,6 +6,10 @@
 command -v pnpm >/dev/null 2>&1 || exit 0

 cd "$ROOT_DIR" || exit 0
-pnpm -r run type-check
-exit 0
+
+OUTPUT=$(pnpm -r run type-check 2>&1)
+STATUS=$?
+[ $STATUS -eq 0 ] && exit 0
+
+echo "$OUTPUT" >&2
+exit 2
```

`exit 2` blockiert das Stoppen und gibt stderr an Claude zurück — dieselbe
Semantik, die `guard.sh` bereits nutzt.

### 2.2 Fehlende Hooks

**a) SessionStart-Check für `pnpm` (schließt eine bereits dokumentierte,
wiederkehrende Fehlerklasse):** Auf diesem Rechner ist `pnpm` ein
Corepack-Shim in der mise-Node-Installation; ein mise-Update hat ihn
bereits einmal entfernt und `pnpm` überall stillschweigend unbrauchbar
gemacht — inklusive Git-Hooks und Subagent-Shells. `verify.sh` degradiert
in diesem Fall komplett lautlos (`command -v pnpm || exit 0`, kein
Hinweis). Ein SessionStart-Hook, der das einmal pro Session laut macht,
verhindert, dass jeder Subagent unabhängig auf dasselbe "pnpm: command not
found" läuft, ohne den Grund zu kennen:

```diff
+++ b/.claude/hooks/check-pnpm.sh
+#!/bin/bash
+command -v pnpm >/dev/null 2>&1 && exit 0
+echo "pnpm nicht im PATH — bekannter mise/corepack-Shim-Ausfall. Beheben mit:
+export PATH=\"\$HOME/.local/share/mise/installs/node/24.18.0/bin:\$PATH\"
+corepack enable --install-directory \"\$HOME/.local/share/mise/installs/node/24.18.0/bin\"
+(Node-Version mit 'mise ls' prüfen, falls abweichend)" >&2
+exit 0
```

```diff
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@
+    "SessionStart": [
+      { "hooks": [ { "type": "command", "command": ".claude/hooks/check-pnpm.sh" } ] }
+    ],
     "Stop": [
```

**b) Gate für "reviewer MUSS vor jedem Commit laufen":** `CLAUDE.md:27`
verlangt das per Prosa, aber nichts erzwingt es — kein Hook prüft, ob der
`reviewer`-Subagent seit dem letzten Commit tatsächlich lief. Ein
Marker-basiertes Gate schließt zumindest das versehentliche Vergessen (kein
Schutz gegen absichtliches Umgehen — das ist mit einem Bash-Hook auch nicht
sauber lösbar):

```diff
--- a/.claude/agents/reviewer.md
+++ b/.claude/agents/reviewer.md
@@ -9,6 +9,8 @@
 Run: `pnpm run precommit`

+On completion, run `date +%s > .claude/.reviewer-ran`.
+
 Lint enforces the FCIS boundaries mechanically ...
```

```diff
+++ b/.claude/hooks/require-review.sh
+#!/bin/bash
+INPUT=$(cat)
+CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
+case "$CMD" in
+  git\ commit*)
+    if git diff --cached --name-only | grep -qE '/(core|shell)/'; then
+      LAST=$(cat .claude/.reviewer-ran 2>/dev/null || echo 0)
+      NOW=$(date +%s)
+      # kein Review in den letzten 30 Minuten für core/shell-Änderungen
+      [ $((NOW - LAST)) -gt 1800 ] && {
+        echo "Kein aktueller @reviewer-Lauf für staged core/shell-Änderungen. Erst @reviewer ausführen." >&2
+        exit 2
+      }
+    fi
+    ;;
+esac
+exit 0
```

Wired als `PreToolUse`-Matcher `Bash`.

**Ersatzlos streichbar:** keiner der vier bestehenden Hooks — nach Fix 2.1
ist jeder einzelne durch einen konkreten, verifizierten Fehlerfall
begründet. `enforce-zones.sh`'s eigener Kommentar benennt seine einzige
bekannte Lücke (Bash-Writes via `sed -i`/`cat >` umgehen das Routing) bereits
selbst und verweist korrekt auf ESLint/pre-commit/CI als Backstop — das ist
ehrliche, nicht cargo-cultige Dokumentation und sollte so bleiben.

---

## 3. Kontext-Ökonomie

### 3.1 Testing-Konvention treibt Agents in die teuersten Dateien des Repos

`AGENTS.md:55-58` verlangt, neue Fälle in die _bestehende_
`shell/route.integration.test.ts` der Feature zu schreiben. Die größten
Testdateien im Repo:

```
140K  packages/backend/src/adapters/lms-client/client.acceptance.test.ts
100K  packages/backend/src/features/radio-mode/shell/radio-service.integration.test.ts
 72K  packages/backend/src/features/radio-mode/radio-acceptance.test.ts
 68K  packages/frontend/src/domains/queue/ui/QueueView.test.ts
 60K  packages/frontend/src/domains/search/ui/SearchResultsList.test.ts
```

Jede Session, die laut Konvention "eine Zeile in die bestehende Testdatei"
hinzufügt, muss diese Datei vorher vollständig lesen — 100–140KB reiner
Testcode für einen einzelnen neuen Fall. Das ist eine direkte Folge einer
Harness-Anweisung, kein Zufall.

```diff
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -53,6 +53,10 @@
 ## Testing

+Übersteigt die Zieldatei bereits ~20 KB (mehrere tun das bereits, z. B.
+`client.acceptance.test.ts` mit 140 KB), neue Fälle in eine
+Geschwisterdatei (`*.<scenario>.test.ts`) auslagern statt in den Monolith
+anzuhängen — sonst lädt jede künftige Session zur selben Feature die
+komplette Datei nur für einen neuen Fall.
+
 Every new feature and every bug fix must include tests. ...
```

### 3.2 `review:collect`-Artefakte: menschenlesbar statt maschinenlesbar

`scripts/review-collect.mjs` schreibt rohen `stdout`+`stderr` jedes Checks
unverändert in `.review-artifacts/*.txt` (gut: nicht direkt in die Konsole,
Verzeichnis ist `.gitignore`t). Aber: liest eine spätere Session so eine
Datei, um einen einzelnen Befund zu finden, muss sie den kompletten
Rohtext laden — `knip` und `jscpd` unterstützen beide JSON-Output, was
gezieltes `jq`/`grep` statt Volltextlektüre erlauben würde.

```diff
--- a/package.json
+++ b/package.json
@@
-    "check:dead": "knip",
+    "check:dead": "knip --reporter json",
```

```diff
--- a/.jscpd.json
+++ b/.jscpd.json
@@
-  "reporters": ["console"],
+  "reporters": ["console", "json"],
```

(`knip` als Top-Level-Script bleibt Klartext für interaktive Nutzung durch
Menschen — nur `check:dead`, das ausschließlich von `review:collect`/
`precommit` konsumiert wird, wechselt auf JSON.)

### 3.3 Zwei Scripts, ein Befehl

`package.json`: `"check:arch": "pnpm run depcruise"` und
`"check:cycles": "pnpm run depcruise"` sind byte-identisch — aktuell hat
`.dependency-cruiser.cjs` genau eine Regel (`no-circular`), das reflektiert
sich aber nicht im Naming. Ein Agent, der herausfinden will, welcher Check
für "Zyklen" zuständig ist, liest zwei Zeilen für eine Information.

```diff
--- a/package.json
+++ b/package.json
@@
-    "check:arch": "pnpm run depcruise",
     "madge:graph": "madge --image .review-artifacts/dependency-graph.svg packages/backend/src packages/frontend/src packages/shared/src",
     "check:types": "pnpm -r run type-check",
     "check:dead": "knip",
-    "check:arch": "pnpm run depcruise",
     "check:cycles": "pnpm run depcruise",
```

_(eine der beiden Zeilen entfernen, `review-collect.mjs`'s `checks`-Array
entsprechend um einen Eintrag kürzen; sobald `.dependency-cruiser.cjs`
tatsächlich getrennte Arch- und Cycle-Regeln bekommt, wieder auftrennen —
siehe die `ponytail:`-Kommentare in der Datei selbst, die genau diese
Zurückhaltung begründen.)_

Kein fehlender `.claudeignore`-Bedarf gefunden: `.gitignore` deckt bereits
alle generierten Verzeichnisse ab (`dist/`, `coverage/`, `.review-artifacts/`
etc.), und die im Repo erlaubten Suchwerkzeuge (`rg` in
`settings.local.json`) respektieren `.gitignore` ohnehin.

---

## 4. Slash-Commands und Subagents

### 4.1 Dieser Review-Workflow selbst ist nicht gekapselt

Der Dateiname `docs/review/03-harness.md` impliziert eine laufende Serie
solcher Audits — ein wiederkehrender, mehrseitiger Prompt (5 Bewertungs-
kriterien, Diff-Pflicht, Zielpfad-Konvention), der offenbar jedes Mal neu
ausgeschrieben wird. Das ist der klarste Kandidat für einen Slash-Command:

```diff
+++ b/.claude/commands/repo-review.md
+---
+description: Audit einen Aspekt des Repos (harness, architecture, tests, ...) und schreibe die Ergebnisse nach docs/review/NN-<topic>.md
+argument-hint: <topic>
+---
+
+Auditiere $ARGUMENTS für dieses Repo. Ändere keine Dateien. Lies die
+relevante Konfiguration/den relevanten Code, bewerte streng, und schreibe
+den Report in den nächsten freien `docs/review/NN-<topic>.md`-Slot. Jede
+Empfehlung muss ein konkreter Datei-Diff im Codeblock sein, begründet mit
+dem konkreten Fehlverhalten, das sie verhindert — keine unbegründeten
+Vorschläge, keine reinen Prosa-Empfehlungen.
```

### 4.2 `reviewer.md` ist bereits hinter dem eigenen Quality-Gate zurück

`CLAUDE.md:27` beschreibt `@reviewer` als "architectural checks and full
test suite", aber `reviewer.md:11` führt nur
`pnpm type-check && pnpm lint && pnpm test` aus. Das neu hinzugekommene
`package.json`-Script `precommit` (bereits in `.husky`/CI-Pfad verankert)
umfasst zusätzlich `test:coverage`, `knip`, `depcruise` — genau die Checks,
die die neuen Config-Dateien (`.dependency-cruiser.cjs`, `.jscpd.json`,
`knip.json`, alle unstaged/neu) einführen sollen. Der Subagent, der laut
eigener Beschreibung für "architectural checks" zuständig ist, prüft
Architektur (Zyklen, tote Exporte) aktuell nicht.

```diff
--- a/.claude/agents/reviewer.md
+++ b/.claude/agents/reviewer.md
@@ -9,7 +9,8 @@
-Run: `pnpm type-check && pnpm lint && pnpm test`
+Run: `pnpm run precommit`
+(aktuell: test, lint, coverage, type-check, knip, depcruise — ein Alias
+statt einer zweiten Liste, damit dieser Prompt nie wieder aus dem Tritt
+mit dem echten Gate gerät)
```

### 4.3 Redundanz zwischen Skill und AGENTS.md-Tabelle

`new-tidal-feature`-Skill und `AGENTS.md:86-97` beschreiben denselben
Fünf-Schichten-Ablauf für neue Tidal-Endpunkte, einmal als Skill (mit
Delegier-Anweisungen pro Layer), einmal als Tabelle in AGENTS.md. Sobald
Fix 1.1 greift und AGENTS.md wieder geladen wird, konkurrieren beide Texte
um dieselbe Information — Drift ist nur eine Frage der Zeit.

```diff
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -86,20 +86,7 @@
-## Backend: Tidal feature anatomy
-
-For any new Tidal endpoint, three files are involved — use the existing
-`/api/tidal/albums/:albumId/tracks` endpoint as a complete template:
-
-| Layer        | File                                                         | Role                                                    |
-| ------------ | ------------------------------------------------------------ | -------------------------------------------------------- |
-...
+## Backend: Tidal feature anatomy
+
+Siehe `.claude/skills/new-tidal-feature/SKILL.md` — gleicher Inhalt, an
+einer Stelle gehalten, damit beide nicht auseinanderlaufen.
```

### 4.4 Vor einem neuen "Code-Health"-Subagent: Doppelung mit vorhandenen Skills prüfen

Die vier neuen Checks (knip/depcruise/jscpd/type-coverage) plus
`review:collect` decken teils dasselbe Feld ab wie die bereits verfügbaren
Skills `ponytail:ponytail-audit` ("ranked list of what to delete") und
`simplify` ("reuse, simplification, efficiency"). Bevor hierfür ein neuer
Subagent gebaut wird: erst prüfen, ob `ponytail-audit`/`simplify` die
`.review-artifacts/`-Ausgaben einfach als Input nehmen können — sonst
entsteht eine dritte, teilüberlappende Triage-Instanz für dieselbe Frage
("was ist im Code kaputt/redundant").

---

## 5. Verifizierbarkeit

**Die einzige unbedingte, mechanisch erzwungene Gate im gesamten System ist
`.husky/pre-commit`** (Git-Ebene, `sh -e`, tool-agnostisch) — und die prüft
keine Tests, nur Type-Check + FCIS-Grep + lint-staged. Volle Tests laufen
erst in `.husky/pre-push`, also erst kurz vor dem Push, potenziell nach
vielen Commits.

Auf Claude-Ebene:

- `core-dev.md:17` / `shell-dev.md:21`: verlangen nur `pnpm type-check`
  (bzw. `+ pnpm lint`) nach jeder Änderung — **kein** `pnpm test`. Ob
  Tests überhaupt laufen, hängt vollständig davon ab, ob der delegierende
  Prompt die Checkliste aus `CLAUDE.md:34-38` korrekt befolgt hat. Das ist
  keine Eigenschaft des Subagents, sondern eine Hoffnung an den
  Hauptkontext.
- `verify.sh` (Stop-Hook): sollte die automatische Rückfallebene sein,
  ist aber aktuell wirkungslos (2.1) und deckt selbst im reparierten
  Zustand nur Type-Fehler ab, keine Tests, keine Architekturregeln.
- `@reviewer` deckt zwar Tests + Architektur ab, läuft aber nur, wenn der
  Hauptkontext sich an `CLAUDE.md:27` erinnert — nichts erzwingt das
  (siehe 2.2b).

**Ergebnis:** Der Agent kann heute autonom und garantiert nur eine einzige
Frage beantworten — "kompiliert es noch?" — und selbst das nur, wenn der
Hauptkontext `@core-dev`/`@shell-dev` überhaupt aufruft (der
Zonen-Enforcement-Hook erzwingt zumindest das). Ob neue Tests existieren,
ob sie grün sind, ob Architekturregeln (Zyklen, tote Exporte, Duplikate)
verletzt wurden — das bleibt bis zum nächsten `git commit` unsichtbar, und
selbst dann nur teilweise (keine Tests im Pre-Commit-Hook).

**Fix** (Testlauf in die Subagent-Definition selbst verlagern, statt sich
auf die Prompt-Disziplin des Hauptkontexts zu verlassen):

```diff
--- a/.claude/agents/core-dev.md
+++ b/.claude/agents/core-dev.md
@@ -14,3 +14,5 @@

-After every change run: `pnpm type-check`
-Fix all errors before stopping.
+After every change run: `pnpm type-check` and the affected package's
+`pnpm test -- <changed-file-pattern>`.
+Fix all errors and failing tests before stopping — this is part of this
+agent's own definition of done, not something the delegating prompt needs
+to ask for separately.
```

```diff
--- a/.claude/agents/shell-dev.md
+++ b/.claude/agents/shell-dev.md
@@ -18,4 +18,6 @@

-After changes: `pnpm type-check && pnpm lint`
+After changes: `pnpm type-check && pnpm lint && pnpm test -- <changed-file-pattern>`
+Do not rely on the delegating prompt to ask for this separately — it is
+part of this agent's own definition of done.
```

Zusammen mit Fix 2.1 (Stop-Hook gated tatsächlich) und Fix 2.2b
(Reviewer-Marker vor Commit) entsteht damit eine durchgängige Kette statt
drei unabhängiger, jeweils lückenhafter Einzelmaßnahmen.
