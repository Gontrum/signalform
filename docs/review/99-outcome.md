# 99 — Outcome: Baseline vs. Ist-Zustand

> **Momentaufnahme vom 2026-07-26.** Dokumentiert einen Review-Durchlauf zu
> diesem Zeitpunkt, wird nicht gepflegt und spiegelt nicht zwingend den
> aktuellen Stand des Codes wider. Für den heutigen Umsetzungsstand: `git log`
> und den Code selbst prüfen, nicht diese Datei als Referenz nehmen.

Grundlage: frischer `pnpm run review:collect`-Lauf (2026-07-26) gegen
`HEAD` (`cd143f2a`), verglichen mit den in `01-code.md` (25.07., 08:14) und
`03-harness.md` (24.07., 15:14) dokumentierten Baselines. Zusätzlich: voller
`pnpm run test`-Lauf (3112 Tests, alle grün), gezielte `grep`/Datei-Checks
für jeden Backlog-Punkt aus `00-plan-detailled.md`, und ein Vergleichslauf
von `knip` gegen den Baseline-Commit (`32ccfbc3`) in einem temporären
Worktree zur Ursachenklärung eines neuen Befunds. Keine Produktionsdatei in
diesem Review-Schritt geändert.

**Update (2026-07-26, nach diesem Report):** Die vier unten unter "Nicht
erledigt" gelisteten A11y-Quick-Wins wurden in vier Folge-Commits behoben
(je über `@shell-dev` implementiert, `@reviewer` vor jedem Commit gelaufen):
`3739e82f` (Toggle-Accessible-Name), `e5f0cfb3` (AlbumCard
nested-interactive), `adbbd22c` (Autocomplete-aria-label-Platzierung),
`f4bb8e69` (Decade-Chip- + Clear-Filters-Kontrast). Der Abschnitt
"Nicht erledigt" unten bleibt als historischer Zustand zum Zeitpunkt dieses
Reports stehen; alle vier Punkte sind mittlerweile geschlossen und die
`a11y.spec.ts`-Regressionsspec deckt sie ab (`button-name` auf `/settings`,
`nested-interactive`+`color-contrast` auf `/library`,
`aria-input-field-name` auf `/`).

## Metriken: Vorher/Nachher

| Metrik                       | Baseline (`01-code.md`, 25.07.)                            | Ist-Zustand (26.07., `HEAD` = `cd143f2a`)                              | Δ                                           |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| **type-coverage** shared     | 100.00 %                                                   | 100.00 % (1541/1541)                                                   | unverändert                                 |
| **type-coverage** backend    | 99.49 % (78007/78400)                                      | 99.50 % (78055/78442)                                                  | +0.01 pp (mehr Code, gleiche Quote)         |
| **type-coverage** frontend   | 97.52 % (49936/51204)                                      | 97.53 % (51224/52519)                                                  | +0.01 pp                                    |
| **knip** (Dead-Code)         | 0 Findings                                                 | **1 Finding** (unlisted devDependency `tailwindcss`, Frontend)         | **Regression** — Details unten              |
| **dependency-cruiser**       | 0 Verstöße (248 Backend / 231 Frontend / 17 Shared Module) | 0 Verstöße (249 Backend / 238 Frontend / 17 Shared Module)             | unverändert (0), Modulzahl leicht gewachsen |
| **jscpd** Klone              | 21                                                         | 14                                                                     | **−7 (−33 %)**                              |
| **jscpd** duplizierte Zeilen | 291 (0.97 %)                                               | 187 (0.62 %)                                                           | **−104 Zeilen**                             |
| **jscpd** duplizierte Token  | 1899 (1.36 %)                                              | 1182 (0.84 %)                                                          | **−717 Token**                              |
| **jscpd** Script-Exit        | `exit 1` (Schwelle 0 %, nicht in `precommit`)              | `exit 0` (Schwelle geratcht auf 0.62 %, **in `precommit` integriert**) | behoben                                     |
| **Tests**                    | (nicht Teil des Reports)                                   | 3112/3112 grün (shared 87, backend 1728, frontend 1297)                | —                                           |

## Erledigt aus `00-plan-detailled.md`

**Welle 1 (Harness):**

- #1 jq-Fail-open in `guard.sh`/`enforce-zones.sh` geschlossen — beide Hooks haben jetzt `command -v jq`-Guard.
- #2 `check:dupes` in `precommit` aufgenommen, Schwelle auf Ist-Wert (0.62 %) geratcht (Commit `1028a491`).

**Welle 2 (Backend):**

- #4 `Math.random()` aus `seed-merger.ts` entfernt.
- #5 Queue-Endpunkte auf Zod umgestellt (`isBodyRecord`: 0 Vorkommen mehr in `queue/shell/route.ts`).
- #6 `_request as FastifyRequest`-Cast entfernt.
- #7 `QueueRemovalResult` auf `shared`-`Result`-Typ umgestellt.
- #8 `handleQueueRemoval` in benannte Schritte zerlegt (`capturePreRemovalRadioContext`, `emitPostRemovalQueue`, `triggerRadioReplenishment`, dokumentierte Step-Kommentare).

**Welle 2 (Frontend):**

- #9 Settings-Sektionsüberschriften + Setup-Wizard-Kontrast behoben (bestätigt durch Kommentar in `a11y.spec.ts:7`).
- #10 SearchPanel `<h1>`/`PageHeader`-Phone-Weiche ergänzt.
- #11 Hartkodierter deutscher String ersetzt durch `t('library.featuredTidal')` (`LibraryView.vue:205`).
- #12 Undefinierte `primary`/`primary-dark`-Klassen: 0 Vorkommen mehr.
- #13 Destruktive Settings-Aktionen auf Doppel-Tap-Pattern umgestellt (Commit `06e1ec19`).

**Welle 3 (Backend-Duplikate):**

- #14 `isRecord`/`isBodyRecord` konsolidiert — nur noch 1 Definition (`lms-client/execute.ts`), alle anderen importieren.
- #16 `App.spec.ts`/`HomeView.spec.ts`-Test-Setup-Duplikat in gemeinsame Fixture ausgelagert (Commit `4f228372`).

**Welle 3 (Frontend-Musterkonsolidierung, #17-27):**

- Gemeinsame Primitives existieren und werden verwendet: `ui/LoadingSpinner.vue` (#17), `ui/EmptyState.vue` (#18), `ui/Banner.vue` (#19), `domains/search/ui/AlbumActionButtons.vue` (#20), `ui/Popover.vue` (#21).
- #22 Off-Palette-Farbnutzungen (`text-red-*`/`bg-blue-*`/etc.): 0 Treffer mehr.
- #23 `min-h-[44px]`: 0 Treffer mehr.
- #25 `<style scoped>` in `ProgressBar.vue`/`VolumeControl.vue`: entfernt, komplett auf Tailwind-Utilities migriert.
- #26 Arbiträre `z-[N]`-Werte: 0 Treffer mehr.

**Nicht in einer Welle, aber gelöst (#28, Landmark-Struktur, 2.11):**

- Der Plan stellte dies bewusst zurück, weil es "eine Layout-Entscheidung
  braucht (AppLayout überall vs. gemeinsames `<main>`)". Der unabhängig
  entstandene Commit `cd143f2a` ("consolidate MainNavBar and Now Playing
  into a global AppLayout shell") trifft genau diese Entscheidung: `App.vue`
  wrappt jetzt alle nicht-immersiven Routen (Home, Library, Queue, Settings)
  in `AppLayout`, das `<main>` (linke Spalte) + `<aside aria-label="Now
Playing">` (rechte Spalte) liefert, plus globales `<nav>` (`MainNavBar.vue`/
  `BottomNavBar.vue`). Landmark-Struktur ist damit über alle Routen
  konsistent — als Nebenprodukt einer Architektur-Refaktorierung, nicht als
  gezielter A11y-Fix.

## Bewusst zurückgestellt (aus der Vollzähligkeitsprüfung, §3b/§6, unverändert)

- **`networkInterfaces()`-Cast in `discovery.ts`**: weiterhin offen, Report
  selbst stufte es als "praktisch unkritisch" ein — kein aktiver Bug, geht
  nur mit, wenn die Datei aus anderem Grund angefasst wird.
- **Zwei unabhängige `aria-live`-Regionen**: explizit als Geschmacksfrage
  eingestuft, unverändert, kein Handlungsbedarf.
- **`navigator.mediaSession`-Handler**: Feature-Lücke außerhalb des
  Review-Scopes, unverändert.
- **Tote TODO-Tracking-Sektion in `AGENTS.md`**: Kosten/Nutzen beider Seiten
  praktisch null, bewusst liegen gelassen — verifiziert weiterhin vorhanden,
  weiterhin wirkungslos (keine `TODO.md` im Repo).
- **`type-coverage --detail`-Auflösung der Any-Lücke** und **vollständige
  manuelle Durchsicht von `lastfm-client.ts`**: Plan stufte einen
  vollständigen Reread als ohne zusätzlichen Entscheidungswert ein — nicht
  durchgeführt, unverändert gültig.

## Nicht erledigt, obwohl im Plan vorgesehen

Der `a11y.spec.ts`-Kommentar selbst (Zeilen 9-12) bestätigt, dass **vier der
fünf Quick-Win-Accessibility-Befunde aus `02-ui.md` noch offen sind** — nur
Quick Win #1 (jq-Fail-open) wurde behoben, #9/#10 aus Welle 2 wurden
umgesetzt, aber die eigentlichen Top-5-Quick-Wins #2-#5 nicht:

- **Toggle ohne Accessible Name** (`personal-radio-toggle`,
  `scrobbling-toggle`, `SettingsView.vue:598-612` bzw. `:651-664`): verifiziert
  — kein `aria-label`/`aria-labelledby` auf beiden `<button role="switch">`.
  Axe `critical`, WCAG 4.1.2 — unverändert seit `01-code.md`.
- **Nested Interactive Controls in `AlbumCard.vue`**: `role="button"` auf
  dem äußeren Card-Div weiterhin vorhanden (`AlbumCard.vue:26`), Diff aus dem
  Report nicht angewendet.
- **Autocomplete-`aria-label`-Platzierung**: `AutocompleteDropdown.vue:84`
  hat weiterhin `aria-label="Autocomplete suggestions"` auf einem `<div>`
  ohne Listbox-Rolle statt auf der Listbox selbst.
- **Decade-Filter-Chip-Kontrast**: der im Report vorgeschlagene
  Ein-Zeilen-Diff (`accent-500` → `neutral-900`) wurde nicht gefunden.

Die permanente axe-Regressionsspec deckt diese vier Routen/Regeln deshalb
absichtlich **nicht** ab (`rules`-Arrays je Route enthalten kein
`aria-required-attr`/`nested-interactive`/`color-contrast` für die
betroffenen Komponenten) — sie ist so eng geschnitten, dass sie trotz der
offenen Befunde grün bleibt. Das ist im Code selbst dokumentiert und keine
verdeckte Lücke, aber ein Punkt, der beim nächsten Batch dieser vier Fixes
aktiv erweitert werden muss (Kommentar in `a11y.spec.ts:14-16` verlangt das
bereits explizit).

**Welle 3, #15 (genre-radio/loved-radio-Klone) nur teilweise erledigt:**
`tidal-routes.ts` ↔ `queue/shell/route.ts` (4 Klon-Paare in der Baseline) ist
vollständig verschwunden — 0 Treffer im aktuellen `check-dupes.txt`. Der
zweite im Report namentlich genannte Cluster,
`genre-radio/shell/route.ts` ↔ `loved-radio/shell/route.ts`, besteht dagegen
weiterhin (3 Klon-Paare, 8-35 Zeilen), zusätzlich jetzt auch mit
`personal-radio/shell/route.ts` verzahnt (2 neue Paare gegenüber der
Baseline). Diese drei Radio-Feature-Routen teilen also weiterhin
unextrahierte Logik — verstärkt statt reduziert, siehe unten.

## Neue Auffälligkeiten seit der Umsetzung

1. **knip-Regression: `tailwindcss` als unbenutzte devDependency
   (false positive, aber ein neuer, ungetrackter Befund).**
   Ursache verifiziert per Vergleichslauf im temporären Worktree gegen
   Baseline-Commit `32ccfbc3` (dort: `knip` → `{"issues":[]}`). Zwischen
   Baseline und `HEAD` liegt Commit `bf2c3b7d "refactor(frontend): migrate
Tailwind config to CSS-based v4 theme"`, der `tailwind.config.js`
   entfernt hat (Tailwind v4 CSS-first: Theme lebt jetzt in
   `@theme`-Direktiven in `main.css`). `tailwindcss` selbst wird weiterhin
   aktiv über `@import 'tailwindcss'` (`main.css:1`) und
   `@tailwindcss/postcss` (`postcss.config.js:8`) genutzt — die Abhängigkeit
   ist real, aber knips Tailwind-Plugin erkennt die Nutzung offenbar nur über
   die Existenz einer `tailwind.config.*`-Datei, nicht über den reinen
   CSS-`@import`. Ergebnis: ein legitimer Architektur-Fortschritt (CSS-first
   Config, kein JS-Config-File mehr nötig) hat einen Tooling-Blindspot in
   `knip` freigelegt. **Kein echter toter Code**, aber der erste Riss in der
   bisher makellosen "0 knip-Findings"-Garantie, die `01-code.md`s Executive
   Summary als Positivpunkt nennt. Fix-Optionen: `tailwindcss` in
   `knip.json`s `ignoreDependencies` für `packages/frontend` aufnehmen (mit
   Kommentar, warum), oder auf eine neuere knip-Version warten, die Tailwind
   v4 CSS-first-Configs erkennt.
2. **Neue Klon-Paarungen bei den Radio-Features.** Die Baseline nannte nur
   `genre-radio` ↔ `loved-radio`. Der aktuelle `check:dupes`-Lauf zeigt
   zusätzlich `genre-radio/shell/route.ts` ↔ `personal-radio/shell/route.ts`
   (32 Zeilen) und `loved-radio/shell/route.ts` ↔
   `personal-radio/shell/route.ts` (19 Zeilen) — vermutlich, weil
   `personal-radio` seit der Baseline weiterentwickelt wurde und dabei
   dasselbe unextrahierte Muster erneut kopiert hat, statt es mit den beiden
   bestehenden Geschwistern zusammenzuführen. Bestätigt strukturell genau
   das Risiko, das `01-code.md`s Verständlichkeit-Fund #5 und der Plan-Punkt
   2.6 beschrieben haben: der Cluster wächst weiter, solange keine
   gemeinsame Abstraktion existiert.
3. **Neue Selbst-Klon-Stelle: `lms-client/types.ts` ↔
   `metadata/core/service.ts`** (11 Zeilen) — im Baseline-Report nicht
   erwähnt, in der aktuellen Liste neu. Nicht weiter untersucht (außerhalb
   des Auftragsumfangs dieses Vergleichs), aber ein Kandidat für die nächste
   `check:dupes`-Durchsicht.
4. **Neuer Klon `lastfm-auth/shell/route.ts` ↔ `lms-wake/shell/route.ts`**
   (8 Zeilen) — `lms-wake` ist ein Feature, das in `01-code.md` noch nicht
   existierte (dort ausschließlich `lastfm-auth` ↔ `users` als Cluster
   genannt). Neues Feature, altes Duplikations-Muster wiederholt.

## Fazit

Der Umsetzungsplan wurde zu einem großen Teil abgearbeitet: alle
Backend-Strukturbefunde (Welle 2) und die meisten Duplikat-/Token-Drift-Punkte
(Welle 3) sind verifiziert erledigt, `check:dupes` läuft jetzt als Gate in
`precommit`, und die Landmark-Frage wurde durch eine unabhängige
Architektur-Entscheidung mitgelöst. Zwei Lücken bleiben aber real: die
**vier ursprünglichen Top-Quick-Wins zur Barrierefreiheit sind nicht
umgesetzt** (von der eigenen Test-Suite dokumentiert, nicht nur vergessen),
und die **Radio-Feature-Duplikation wächst weiter statt zu schrumpfen**,
während neue, kleinere Duplikate an anderer Stelle entstanden sind. Beides
sollte vor dem nächsten Audit-Zyklus in die Wave-Planung zurückfließen,
statt in einem neuen, unabhängigen Fund unterzugehen.
