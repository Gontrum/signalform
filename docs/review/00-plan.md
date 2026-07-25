# 00 — Synthese und Umsetzungsplan

Grundlage: `01-code.md` (Backend/Architektur), `02-ui.md` (Frontend/A11y),
`03-harness.md` (Claude-Code-Konfiguration). Diese Datei liest nur die drei
Reports, keine eigene Codeanalyse.

---

## 1. Top 5 nach Wirkung/Aufwand

| #   | Befund                                                                                                                                                                                                                  | Report         | Aufwand                                          | Warum ganz oben                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `verify.sh` (Stop-Hook) prüft den Exit-Code von `pnpm -r run type-check` gar nicht und endet immer mit `exit 0` — der einzige automatische Rückfall-Gate im System tut faktisch nichts                                  | 03, §2.1       | S (4-Zeilen-Diff)                                | Betrifft _jede_ Session ab sofort; ohne diesen Fix ist jede andere Zusage in diesem Plan ("Tests laufen automatisch") falsch                                |
| 2   | `AGENTS.md` wird von Claude Code nie automatisch geladen (`CLAUDE.md` referenziert es nur als Prosa-Verweis, kein `@import`) — FCIS-Detailregeln, Testkonventionen, Tidal-Anatomie sind für den Hauptkontext unsichtbar | 03, §1.1       | S (2-Zeilen-Diff + 3 Symlinks)                   | Root Cause hinter mehreren anderen Harness-Funden (redundante Doku, tote TODO-Sektion); ohne diesen Fix ist jede inhaltliche AGENTS.md-Änderung wirkungslos |
| 3   | `guard.sh`/`enforce-zones.sh` sind fail-open: fehlt `jq`, greifen weder Lockfile-Schutz noch Zonen-Enforcement — lautlos, ohne Hinweis                                                                                  | 03, Tabelle §2 | S (ein `command -v jq`-Guard)                    | Genau der Mechanismus, auf den sich `CLAUDE.md` als "zusätzliche Härtung" der FCIS-Grenze beruft, kann komplett und unbemerkt abschalten                    |
| 4   | Toggle-Switches ohne Accessible Name (`personal-radio-toggle`, `scrobbling-toggle`)                                                                                                                                     | 02, Befund 1   | S (2-Zeilen-Diff, i18n-Keys existieren bereits)  | axe `critical`, WCAG 4.1.2 — Screenreader-Nutzer können zwei Kernfunktionen der Settings-Seite nicht bedienen                                               |
| 5   | Nested Interactive Controls in `AlbumCard.vue`/`AlbumListRow.vue`                                                                                                                                                       | 02, Befund 2   | S/M (Rolle/Tabindex verschieben, Diff liegt vor) | axe `serious`, aber Streuung: jede Albumkarte im gesamten Frontend ist betroffen, nicht nur eine Ansicht                                                    |

**Warum kein Befund aus 01-code.md in den Top 5 landet:** Die Backend/Architektur-Funde
(`Math.random()` in Core, `QueueRemovalResult`-Divergenz, `isRecord`-Duplikate,
Klon-Extraktion) sind real und günstig zu beheben, aber ihr Blast Radius ist
strukturell/intern — kein aktiver Bug, den ein Nutzer oder eine CI-Pipeline
gerade jetzt sieht. Sie tragen die Wellen 2/3, verdrängen aber keinen der
obigen fünf Punkte, deren Nichtbehebung entweder das gesamte Sicherheitsnetz
lahmlegt (1–3) oder eine laufende WCAG-Verletzung ist (4–5).
Ehrenwerte Erwähnung: `check:dupes` in `precommit` aufnehmen (01, Backlog) —
knapp außerhalb der Top 5, weil rein präventiv (verhindert weiteres
Wachstum der 21 Klone, behebt aber keinen bestehenden Schaden) und weil die
Umsetzung mit Punkt 2 unten kollidiert (siehe Widersprüche).

---

## 2. Widersprüche und Überschneidungen

### 2.1 Echter Sequenzierungs-Konflikt: `check:dupes` in `precommit`

01-code schlägt vor, `check:dupes` (jscpd) in `precommit` aufzunehmen, um
weiteres unbemerktes Duplikat-Wachstum zu verhindern. 01-code selbst
dokumentiert aber, dass `check:dupes` **aktuell mit Exit-Code 1 fehlschlägt**
(21 Klone verletzen die in `.jscpd.json` konfigurierte 0%-Schwelle). Würde
man den Vorschlag unverändert umsetzen, wäre `pnpm run precommit` — und
damit `.husky/pre-commit` sowie `reviewer.md`s vorgeschlagenes
`pnpm run precommit` (03, §4.2) — ab sofort für **jeden** Commit rot, bis
alle 21 Klone (Welle 3, siehe unten) behoben sind. Auflösung im Plan unten:
Schwelle beim Einbau in Welle 1 zunächst auf den Ist-Wert setzen (Ratchet),
erst nach Welle 3 auf 0% verschärfen.

### 2.2 Benannter Widerspruch: "hart durchgesetzt" vs. lautlos abschaltbar

01-code formuliert im Executive Summary explizit: _"Die FCIS-Grenze
(core/shell) ist über eslint-plugin-boundaries + dependency-cruiser
tatsächlich hart durchgesetzt."_ 03-harness zeigt für denselben
Schutzmechanismus (genauer: die zusätzliche Editor-Zeit-Schicht davon,
`enforce-zones.sh`) einen fail-open-Pfad: fehlt `jq`, greift keine der
Hook-Regeln, ohne jede Meldung. Das ist kein reiner Overlap, sondern eine
echte Spannung zwischen den Reports, die hier bewusst nicht geglättet wird:
01-code prüft den **Ist-Zustand des committeten Codes** (0 Verstöße, per
ESLint/depcruise — das läuft in CI unabhängig von `jq`) und hat damit
recht; 03-harness prüft den **Editier-Zeitpunkt-Schutz** eines Claude-Code-
Subagents und findet dort ein Loch. Beide Aussagen sind für ihren jeweiligen
Scope korrekt — aber nebeneinander gelesen suggeriert 01-code eine
Robustheit ("hart durchgesetzt"), die nur so lange stimmt, wie ESLint/CI
tatsächlich vor jedem Merge laufen. Der Hook ist die einzige Schicht, die
_während_ einer Session sofort warnt statt erst bei Push/CI — und genau die
kann lautlos ausfallen.

### 2.3 Überschneidung: Duplikat-Erkennung ist strukturell blind für UI-Musterdrift

01-code (Klon-Erkennung via jscpd) und 02-ui (5× Loading-Spinner, 4×
Empty-State, 7× Error-Banner, 5× Play/Queue-Button-Duo, 2× Popover) belegen
dieselbe Grunderkrankung — Copy-Paste statt Extraktion — in beiden Paketen
unabhängig. Wichtig für die Priorisierung: **jscpd erkennt token-identische
Klone**, die UI-Musterdrift-Funde aus 02-ui sind aber überwiegend
_unterschiedlich implementierte_ Varianten derselben Idee (andere
Border-Farbe, andere Verschachtelung, andere Technik/SVG vs. CSS-Border).
Selbst nachdem `check:dupes` (01-code, Welle 1/3) scharfgestellt ist, wird
es **keinen** der ~15 UI-Pattern-Funde aus 02-ui fangen — das ist eine
Tooling-Lücke, die im Plan namentlich bleibt, nicht stillschweigend als
"eh durch den Dupes-Check abgedeckt" behandelt wird.

### 2.4 Überschneidung: fehlende Test-Garantie trifft genau die UI-Fixes aus Welle 2

03-harness §5 zeigt: nach einer `@shell-dev`-Änderung läuft `pnpm test`
nicht automatisch — nur `type-check`(+`lint`), Testlauf hängt von
Prompt-Disziplin des Hauptkontexts ab. Fast alle konkreten Diffs aus 02-ui
(Settings-ARIA-Labels, AlbumCard-Rollenverschiebung, SearchPanel-`<h1>`)
sind exakt der shell-dev-Zuständigkeitsbereich. Das ist der konkrete Grund,
warum Welle 1 (Harness) vor Welle 2 (UI/Struktur) steht: ohne den
Fix aus 03-harness §5 (Test-Lauf in `core-dev.md`/`shell-dev.md`s eigene
Definition-of-Done) hat keiner der UI-Fixes aus Welle 2 eine automatische
Regressionsabsicherung.

### 2.5 Vermeidbare Doppelarbeit

03-harness §4.4 weist selbst darauf hin, dass ein neuer "Code-Health"-Subagent
für knip/depcruise/jscpd/type-coverage mit den bereits vorhandenen Skills
`ponytail-audit`/`simplify` überlappen würde. Das gilt eins-zu-eins für einen
Teil von 01-code's Backlog (Klon-Extraktion `lastfm-client.ts`,
`genre-radio`/`loved-radio`, `tidal-routes`/`queue`): das ist exakt die Art
Aufgabe, für die `simplify` bereits existiert. Der Plan unten routet diese
Punkte bewusst über den vorhandenen Skill statt über eine neue Custom-Aufgabe.

---

## 3. Umsetzungsplan in Wellen

Format je Aufgabe: **Aufgabe — Quelle — DoD (Kommando)**.

### Welle 1 — Harness (macht alle Folgearbeit sicherer)

1. **`verify.sh` tatsächlich blockierend machen** — 03 §2.1
   DoD: nach dem Fix erzeugt ein injizierter Typfehler `exit 2`:
   `echo 'const x: number = "y";' >> packages/backend/src/scratch.ts && bash .claude/hooks/verify.sh; test $? -eq 2 && echo PASS; rm packages/backend/src/scratch.ts`

2. **`AGENTS.md` per `@import` laden + Package-Symlinks** — 03 §1.1
   DoD: `grep -q '^@AGENTS.md' CLAUDE.md && test -L packages/backend/CLAUDE.md && test -L packages/frontend/CLAUDE.md && test -L packages/shared/CLAUDE.md && echo PASS`
   (deckt nur die strukturelle Korrektheit ab, nicht das tatsächliche Laden zur Laufzeit — das ist mit Bash nicht prüfbar)

3. **`jq`-Fail-open in `guard.sh`/`enforce-zones.sh` schließen** (Guard laut statt lautlos) — 03 Tabelle §2
   DoD: `PATH=/usr/bin:/bin bash .claude/hooks/enforce-zones.sh <<< '{}'; test $? -ne 0 && echo PASS`

4. **`reviewer.md` auf `pnpm run precommit` umstellen** — 03 §4.2
   DoD: `grep -q 'pnpm run precommit' .claude/agents/reviewer.md && echo PASS`

5. **Test-Lauf in `core-dev.md`/`shell-dev.md`'s eigene Definition-of-Done aufnehmen** — 03 §5
   DoD: `grep -q 'pnpm test' .claude/agents/core-dev.md .claude/agents/shell-dev.md && echo PASS`

6. **`check:dupes` in `precommit` aufnehmen, Schwelle zunächst auf Ist-Wert (0,97 %) ratchen** (siehe Widerspruch 2.1) — 01 Backlog + 03 §2.1-Prinzip
   DoD: `pnpm run precommit; echo $?` → `0` auf aktuellem HEAD (Ratchet-Schwelle greift noch nicht restriktiv)

7. **`.mcp.json` für `context7` anlegen, `settings.json` referenzieren** — 03 §1.2
   DoD: `test -f .mcp.json && jq -e '.mcpServers.context7' .mcp.json > /dev/null && echo PASS`

8. **Redundante `context7`-Zeile aus `CLAUDE.md` entfernen** — 03 §1.4
   DoD: `! grep -q 'Use .context7. before implementing any Fastify or Vue API' CLAUDE.md && echo PASS`

9. **`check:arch`/`check:cycles`-Dopplung auflösen** — 03 §3.3
   DoD: `jq '.scripts | has("check:arch") and has("check:cycles")' package.json` → `false`

10. **`knip`/`jscpd` auf JSON-Reporter für `review:collect`-Konsum umstellen** — 03 §3.2
    DoD: `pnpm run check:dead | jq . > /dev/null && echo PASS`

11. **SessionStart-Hook für fehlendes `pnpm` (mise/corepack)** — 03 §2.2a
    DoD: `PATH=/usr/bin:/bin bash .claude/hooks/check-pnpm.sh 2>&1 | grep -q 'mise/corepack' && echo PASS`

12. **`AGENTS.md`-Testkonvention um 20-KB-Sibling-File-Regel ergänzen** — 03 §3.1
    DoD: `grep -q '20 KB' AGENTS.md && echo PASS`

### Welle 2 — Strukturelle Fixes

**Backend (01-code):**

1. **`fisherYatesShuffle`: `Math.random()` als injizierte Funktion** — 01, Architekturgrenzen
   DoD: `! grep -q 'Math.random' packages/backend/src/features/personal-radio/core/seed-merger.ts && pnpm --filter backend test -- seed-merger`

2. **`QueueRemovalResult` auf `Result<QueueProjection \| undefined, LmsError>` aus `shared` umstellen** — 01, Result-Typen
   DoD: `! grep -rq 'QueueRemovalResult' packages/backend/src/features/queue/shell/queue-removal-service.ts && pnpm --filter backend type-check`

3. **`_request as FastifyRequest`-Cast prüfen/entfernen** — 01, Typsicherheit
   DoD: `! grep -q '_request as FastifyRequest' packages/backend/src/features/queue/shell/route.ts && pnpm --filter backend type-check`

4. **Queue-Endpunkte auf Zod umstellen** — 01, Validierung
   DoD: `! grep -q 'isBodyRecord' packages/backend/src/features/queue/shell/route.ts && pnpm --filter backend test -- queue`

5. **`networkInterfaces()`-Cast durch Runtime-Guard ersetzen** — 01, Typsicherheit
   DoD: `pnpm --filter backend type-check && pnpm --filter backend test -- discovery`

6. **`handleQueueRemoval` aufteilen (Radio-Kontext / LMS-Mutation / Replenish-Trigger als benannte Schritte)** — 01, Verständlichkeit #1
   DoD: `pnpm --filter backend test -- queue-removal-service` grün (Verhalten unverändert; Komplexitätsreduktion selbst ist ohne Linter-Metrik nicht maschinell prüfbar — hier nur Regressionsschutz)

**Frontend A11y/Bugs (02-ui):**

7. **Toggle-Switches: `aria-label` ergänzen** — 02, Befund 1
8. **Nested Interactive Controls: Rolle/Tabindex auf Info-Block verschieben (`AlbumCard.vue`, `AlbumListRow.vue`)** — 02, Befund 2
9. **Autocomplete-Dropdown: `aria-label` aufs `<ul role="listbox">` verschieben** — 02, Befund 3
10. **Decade-Filter-Chip: `accent-500` → `neutral-900`** — 02, Befund 4
11. **Settings-Sektionsüberschriften + Setup-Wizard-Label: `text-neutral-400` → `600`** — 02, Befund 5+6
12. **SearchPanel: `<h1>`/`PageHeader`-Phone-Weiche ergänzen** — 02, Befund 7
13. **Hartkodierten deutschen String durch `t('library.featuredTidal')` ersetzen** — 02, Befund 8
14. **Undefinierte `primary`-Klassen → `accent`** — 02, Befund 18 (echter Bug: no-op-CSS)
15. **Destruktive Aktionen in Settings (User-Delete, Last.fm-Disconnect) auf Tap-zweimal-Pattern aus `QueueView.vue` umstellen** — 02, Befund 13 (Risiko: versehentlicher Datenverlust, daher hier statt Welle 3)

Gemeinsames DoD für 7–14: permanente axe-core-Playwright-Regressionsspec
anlegen (ersetzt die temporäre Audit-Spec aus 02-ui), die die drei
auditierten Flows bei 375/768/1440px erneut prüft:
`pnpm --filter frontend exec playwright test e2e/journeys/a11y.spec.ts` →
0 Violations. Diese Spec selbst ist Teil der Welle-2-Lieferung (Test ist
Teil der Implementierung, siehe `AGENTS.md`).
DoD für 15 gesondert: neuer/erweiterter Test in `SettingsView.test.ts`,
der Doppel-Tap vor destruktiver Aktion erzwingt.

### Welle 3 — Politur

**Backend-Duplikate — über den vorhandenen `simplify`-Skill, nicht als Custom-Task (siehe 2.5):**

1. `isRecord`/`isBodyRecord` auf die bereits exportierte Version in `execute.ts` konsolidieren — 01
   DoD: `test $(grep -rl 'function isBodyRecord\|function isRecord' packages/backend/src | wc -l) -eq 1`
2. `genre-radio`/`loved-radio` sowie `tidal-routes`/`queue` gemeinsame Klon-Blöcke extrahieren — 01
3. `lastfm-client.ts` interne Selbst-Klone extrahieren — 01
   DoD (2+3 gemeinsam mit 1): `pnpm run check:dupes; echo $?` → `0`, danach `.jscpd.json`-Schwelle zurück auf `0` ratchen (schließt Welle-1-Aufgabe 6 ab):
   `jq '.threshold' .jscpd.json` → `0`

**Frontend-Musterkonsolidierung — 02-ui, "Ziel bereits im Code vorhanden":**

4. 5× Loading-Spinner auf eine Variante konsolidieren (Ziel: `PlaybackControls.vue`-SVG oder Border-Spin, beide bereits vorhanden)
5. 4× Empty-State auf `NowPlayingPanel.vue:320-383`-Struktur vereinheitlichen
6. 7× Error-Banner auf `error`/`warning`-Semantic-Token (bereits 1× korrekt in `AutocompleteDropdown.vue`)
7. 5× Play/Queue-Button-Duo auf `AlbumActionButtons.vue` migrieren
8. 2× Popover-mit-Backdrop auf eine gemeinsame Basis
9. 165 Off-Palette-Farbnutzungen → `neutral-*`/`error`/`warning`/`success`
10. 17× `min-h-[44px]` → `min-h-11`
11. `ProgressBar.vue`/`VolumeControl.vue`: `<style scoped>` → Tailwind-Utilities
12. Z-Index-Skala definieren, `z-[60]`-Ausreißer einordnen

DoD je Punkt 4–12: `pnpm --filter frontend test` grün (keine Regression)

- Grep-Beleg für Reduktion, z. B. für 10:
  `! grep -rq 'min-h-\[44px\]' packages/frontend/src && echo PASS`;
  für 9: `pnpm run check:dupes`-Lauf plus manueller Grep-Vergleich der
  Off-Palette-Kategorie gegen die 165-Baseline aus 02-ui (kein einzelnes
  Tool deckt das vollständig ab, siehe Lücke 2.3).

13. `App.spec.ts`/`HomeView.spec.ts`-Test-Setup-Duplikat in gemeinsame Fixture — 01, kleinster Fund im Report
    DoD: `pnpm --filter frontend test` grün nach Extraktion.

---

## 4. Was bewusst NICHT gemacht wird

- **Marker-basiertes `require-review.sh`-Gate vor jedem Commit** (03 §2.2b):
  schützt nur gegen versehentliches Vergessen, nicht gegen absichtliches
  Umgehen, und der 30-Minuten-Heuristik-Marker produziert erwartbar
  False Positives bei trivialen Nachfolge-Commits. Zurückgestellt, bis
  vergessene Reviewer-Läufe ein beobachtetes, wiederkehrendes Problem sind
  — nicht auf Vorrat gebaut.
- **LSP-Marketplace-Umstellung** (03 §1.3): Report selbst markiert die
  Schema-Keys als "nicht verifiziert, vor Anwenden gegen aktuelle
  Plugin-Doku prüfen". Ein ungeprüfter Config-Diff kann die LSP-Funktion
  komplett brechen — braucht einen eigenen Verifikations-Schritt, bevor er
  in einen Wellenplan gehört, nicht Teil dieses Plans.
- **Neuer "Code-Health"-Subagent** (03 §4.4): würde `ponytail-audit`/
  `simplify` duplizieren. Welle-3-Dedup-Arbeit läuft stattdessen über den
  vorhandenen `simplify`-Skill (siehe 2.5).
- **Vereinheitlichung der Landmark-Struktur (`<main>` auf allen Routen)**
  (02, Befund 9): kein WCAG-Pflichtverstoß (axe `best-practice`, nicht
  `wcag2*`), Report selbst nennt es eine Layout-Entscheidung, keinen Diff.
  Braucht eine bewusste Design-Entscheidung (alle Routen durch `AppLayout`
  wrappen oder ein gemeinsames `<main>` einführen), nicht Teil dieses Plans.
- **`navigator.mediaSession`/Hardware-Medientasten** (02, Befund 20):
  Feature-Lücke, kein Konsistenz-Bug — außerhalb des Scopes aller drei
  Reviews.
- **Vollständige manuelle Zeile-für-Zeile-Durchsicht von `lastfm-client.ts`
  (825 Zeilen) und `type-coverage --detail`-Auflösung der Any-Lücke**
  (01, Typsicherheit/Verständlichkeit #4): beide Reports markieren das
  selbst als nicht abschließend verifiziert. jscpd- bzw.
  type-coverage-Summary-Werte sind ausreichend Signal für die oben
  gewählten Backlog-Punkte; ein vollständiger manueller Reread ist Aufwand
  ohne zusätzlichen Entscheidungswert an dieser Stelle.
- **Zwei unabhängige `aria-live`-Regionen konsolidieren** (02, Befund 19):
  Report stuft das explizit als Geschmacksfrage ein, beide funktionieren
  korrekt — kein Bug, keine Wellenzuordnung.
- **Neuer Slash-Command für den Review-Workflow selbst** (03 §4.1):
  bereits durch vorhandene Tooling-Infrastruktur in dieser Umgebung
  abgedeckt (der `repo-review`-Skill, der diese drei Reports erzeugt hat)
  — keine zusätzliche Aktion nötig.
