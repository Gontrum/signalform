# 05 — Bestandsaufnahme: Regressionsabdeckung der zehn `04-a11y.md`-Befunde

> **Momentaufnahme vom 2026-07-27.** Dokumentiert einen Review-Durchlauf zu
> diesem Zeitpunkt, wird nicht gepflegt und spiegelt nicht zwingend den
> aktuellen Stand des Codes wider. Für den heutigen Umsetzungsstand: `git log`
> und den Code selbst prüfen, nicht diese Datei als Referenz nehmen.

Reine Bestandsaufnahme, **kein Fix**. Alle zehn Befunde aus `04-a11y.md`
(Backlog-Tabelle, Zeilen 806-819) sind inzwischen umgesetzt. Frage dieses
Reports: existiert für jeden ein Test, prüft er das richtige Verhalten, und
würde er tatsächlich rot, wenn man den Fix zurücknähme?

**Methode**: Für jeden der zehn Befunde wurde der zugehörige Test
identifiziert (`packages/frontend/e2e/journeys/a11y.spec.ts` für 9/10,
`LibraryView.keyboard.test.ts` als Vitest-Unit-Test für #8) und gelesen.
Für **acht der zehn** Befunde wurde der Fix per `git show <commit> --
<datei> | git apply -R` versionskontrolliert und temporär zurückgenommen
(nur die Produktionsdatei, nicht die Testdatei), der zugehörige Test lief
gegen den echten, laufenden Dev-Server/Backend
(`pnpm exec playwright test e2e/journeys/a11y.spec.ts -g "..."`), und danach
wurde der Patch wieder angewendet (`git apply`, ohne `-R`). `git status`/
`git diff --stat` nach jedem Zyklus bestätigt: keine verbleibenden Änderungen
an den elf zurückgenommenen/wiederhergestellten Dateien
(`UserSelectDialog.vue`, `Popover.vue`, `AlbumCard.vue`, `AlbumListRow.vue`,
`AutocompleteDropdown.vue` ×2 Fixes, `ProgressBar.vue`, `VolumeControl.vue`,
`NowPlayingView.vue`) — nur die für diese Session ohnehin bereits
beabsichtigten Änderungen (`LibraryView.vue`/Befund #8,
`UserSelectDialog.vue`+`.test.ts`, `fixtures.ts`/`mockApi.ts`/`a11y.spec.ts`)
blieben stehen. Für #8 (dieselbe Session) wurde die Probe bereits beim
Implementieren gemacht (Stash statt Commit-Revert, siehe eigener
Delegationsverlauf) — hier nur zusammengefasst. Am Ende ein voller
`pnpm exec playwright test e2e/journeys/a11y.spec.ts --project=chromium`-Lauf
gegen den wiederhergestellten Ist-Zustand: **25/25 grün**.

---

## Tabelle: Befund → Test → Stichprobe

| #   | Befund                                                                | Testdatei/Fall                                                                                                                 | Prüft das richtige Verhalten?                                                                                                                               | Zurückgenommen & rot?                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `UserSelectDialog`: kein Fokus-Trap/initialer Fokus/`aria-labelledby` | `a11y.spec.ts:433-501` (3 Fälle) + `UserSelectDialog.test.ts` (`aria-labelledby`-Unit-Test)                                    | Ja — echter `document.activeElement`-Read nach Öffnen, 16 reale Tab/Shift+Tab-Drücke gegen die Hintergrund-Nav-Testids, `getByRole('dialog', {name})`-Check | **Ja, direkt verifiziert** — alle 3 e2e-Fälle rot (Commit `<vorheriger>` zurückgenommen): Fokus bleibt `null`/Body, Tab #1 landet auf `nav-search`, `getByRole('dialog', {name: 'Who are you?'})` findet nichts |
| 2   | `Popover.vue`: Escape schließt nicht, kein Fokus-Rückgabe             | `a11y.spec.ts:252-282` (1 Fall, über Queue-Overflow-Menü)                                                                      | Ja — reale `Escape`-Taste, prüft `aria-expanded`, Panel-Sichtbarkeit UND `document.activeElement` nach dem Schließen                                        | **Ja, direkt verifiziert** (Commit `ef30a15b` zurückgenommen) — Panel bleibt sichtbar nach `Escape`                                                                                                             |
| 3   | Hover-Overlay-Buttons unsichtbar bei Tastatur-Fokus                   | `a11y.spec.ts:292-338` (2 Fälle: `AlbumCard`, `AlbumListRow`)                                                                  | Ja — `getComputedStyle(el).opacity` nach echtem Tab-Fokus, gepollt bis Transition fertig ist (kein Flake durch CSS-Transition)                              | **Ja, direkt verifiziert** (Commit `18a75164` zurückgenommen) — beide Fälle rot, `opacity: 0` trotz Fokus                                                                                                       |
| 4   | Autocomplete: Footer-Item außerhalb `listbox`                         | axe `aria-required-parent`-Regel in `/`-Routencheck (`a11y.spec.ts:74`) **+** separater Keyboard-Test (`a11y.spec.ts:199-243`) | **Teilweise unterschiedlich** — siehe Analyse unten                                                                                                         | Axe-Regel: **ja, direkt verifiziert** (Commit `d3f674b1` zurückgenommen, alle 3 Breakpoints rot). Keyboard-Test: **bleibt grün** auch ohne den Fix — siehe unten                                                |
| 5   | Autocomplete: `aria-controls` zeigt auf nicht-existierende ID         | axe `aria-valid-attr-value`-Regel in `/`-Routencheck                                                                           | Ja                                                                                                                                                          | **Ja, direkt verifiziert** (Commit `3c6553da` zurückgenommen, alle 3 Breakpoints rot)                                                                                                                           |
| 6   | Progress-Slider ohne `aria-valuetext`                                 | `a11y.spec.ts:347-371`                                                                                                         | Ja — liest `aria-valuetext` direkt, plus Guard `valueText !== valueNow` gegen einen Rückfall auf den rohen Zahlenwert                                       | **Ja, direkt verifiziert** (Commit `a53cd2d0` zurückgenommen) — Attribut fehlt komplett, Locator-Timeout                                                                                                        |
| 7   | Autocomplete Empty-State Kontrast 4.34:1                              | axe `color-contrast`-Regel, zusätzlicher gezielter Scan im Empty-State (`a11y.spec.ts:158-186`)                                | Ja, aber **nur zuverlässig bei einem von drei Breakpoints** — siehe Analyse unten                                                                           | **Teilweise** — rot bei `phone (375×812)`, **grün geblieben bei `tablet`/`desktop`** trotz zurückgenommenem Fix (Commit `b7f9957c`), reproduzierbar über 2 Läufe                                                |
| 8   | Library-Source-Tablist: kein Roving-Tabindex/Pfeiltasten              | `LibraryView.keyboard.test.ts` (4 Vitest-Fälle) — **kein e2e-Test in `a11y.spec.ts`**                                          | Ja — echter `.focus()` + `keydown`-Trigger, prüft `document.activeElement` UND `tabindex`-Attribut getrennt                                                 | **Ja, direkt verifiziert** (im Rahmen der Implementierung dieser Session per `git stash` statt Commit-Revert) — alle 4 Fälle rot ohne den Fix                                                                   |
| 9   | `/now-playing` ohne `<main>`-Landmark                                 | `a11y.spec.ts:409-419`                                                                                                         | Ja — zählt reale `<main>`-Elemente im DOM                                                                                                                   | **Ja, direkt verifiziert** (Commit `ec183c1d` zurückgenommen) — `main`-Locator findet 0 Elemente                                                                                                                |
| 10  | Volume-Prozentanzeige: redundantes `aria-live`                        | `a11y.spec.ts:382-398`                                                                                                         | Ja — prüft sowohl Abwesenheit von `aria-live="polite"` als auch Anwesenheit von `aria-hidden="true"`                                                        | **Ja, direkt verifiziert** (Commit `9830c32f` zurückgenommen) — `aria-live="polite"` weiterhin vorhanden                                                                                                        |

**Ergebnis**: 9 von 10 Befunden haben einen Test, der bei Rücknahme des
Fixes zuverlässig rot wird. Zwei Einschränkungen im Detail (Befund #4 und
#7) sind unten ausgeführt — beide sind reale, aber begrenzte Lücken, keine
kompletten "Test bleibt immer grün"-Fälle.

---

## Auffälligkeiten aus den Stichproben

### Befund #4 — der Keyboard-Test ist kein Nesting-Regressionstest

Der dedizierte Test in `a11y.spec.ts:199-243` ("ArrowDown reaches the
footer, wraps around, and Enter on the footer opens full results") **blieb
grün**, als ich ausschließlich die DOM-Verschiebung des Footer-`<li>` (die
eigentliche `aria-required-parent`-Fix-Änderung) zurücknahm. Das ist
**kein Testfehler** — der Kommentar direkt über dem Test (`a11y.spec.ts:192-198`)
sagt exakt das voraus: "the axe `aria-required-parent` rule ... catches the
static ARIA-structure violation ... but axe cannot verify that moving the
footer `<li>` inside the `<ul>` left keyboard navigation unaffected." Der
Test prüft also bewusst ein _anderes_ Risiko (bricht die Index-Arithmetik in
`useSearchPanel.ts` durch die DOM-Verschiebung?), nicht die
Nesting-Korrektheit selbst. Die eigentliche Nesting-Regression wird
ausschließlich von der axe-`aria-required-parent`-Regel im `/`-Routencheck
gefangen — die ich separat zurückgenommen und bestätigt rot bekommen habe.
Fazit: **zwei sich ergänzende, nicht redundante Guards**, korrekt
dokumentiert, kein Handlungsbedarf.

### Befund #7 — Kontrast-Regression nur auf einem von drei Breakpoints zuverlässig erkannt

Mit zurückgenommenem Fix (`text-neutral-500` statt `-600`, Kontrast 4.34:1
gegen den Schwellwert 4.5:1) schlägt der `color-contrast`-Scan auf `/` **nur
beim `phone (375×812)`-Breakpoint** fehl; `tablet (768×1024)` und
`desktop (1440×900)` melden `0 violations`, obwohl exakt dieselbe CSS-Klasse
auf allen drei Breakpoints angewendet wird (keine responsive Textgrößen-Klasse
auf diesem Element). Reproduziert über zwei unabhängige Testläufe, also kein
einmaliger Flake. Wahrscheinlichste Ursache: das Kontrastverhältnis (4.34)
liegt hauchdünn (0.16) unter dem Schwellwert 4.5 — axe-core misst tatsächlich
gerenderte, kantengeglättete Pixel, und Subpixel-Rendering von kursivem Text
kann je nach exakter Fenstergröße/Zeilenumbruch leicht unterschiedliche
Werte an den Buchstabenrändern liefern, die bei einer derart knappen Marge
das Messergebnis kippen können. **Praktische Konsequenz**: Der Guard
existiert und funktioniert (CI würde die Regression über den
`phone`-Testlauf fangen), aber er ist nicht so robust, wie die drei
identischen Breakpoint-Durchläufe suggerieren — zwei von drei sind für
diese spezifische Prüfung faktisch keine zusätzliche Absicherung, nur eine
weitere (in diesem Fall unwirksame) Wiederholung derselben Prüfung.
Keine Fix-Empfehlung hier (außerhalb des Scopes "keine Fixes"), aber
notierenswert, falls der Kontrast später erneut in Richtung 4.5:1 tendiert.

### Befund #8 hat keine e2e-Abdeckung

Alle neun anderen Befunde haben einen Playwright-Test in `a11y.spec.ts` —
Befund #8 (Roving-Tabindex im Library-Source-Tablist, in dieser Session
implementiert) hat ausschließlich einen Vitest-Component-Test
(`LibraryView.keyboard.test.ts`). Das ist funktional ausreichend (der Test
ist real rot ohne den Fix, siehe Tabelle), aber inkonsistent mit dem Muster
der übrigen neun Befunde, von denen jeder auch einen echten
Browser-Regressionstest bekommen hat. Keine Aktion nötig, nur zur
Vollständigkeit vermerkt.

---

## Kernfrage: Ist `a11y.spec.ts` jetzt ein echtes Netz oder immer noch zu eng geschnitten?

**Kurzantwort: beides gleichzeitig — für unterschiedliche Fehlerklassen.**

**Für axe-erkennbare Verstöße** (Befunde #4, #5, #7 — ARIA-Struktur,
ARIA-Attribut-Gültigkeit, Kontrast): Die per-Route `withRules([...])`-Listen
sind ein **reaktives Allowlist-Muster** — jede Route hat exakt die Regeln,
die durch bereits gefundene und gefixte Befunde nötig wurden (`/`: 7 Regeln,
`/library`: 4, `/queue`: 2, `/settings`: 4, `/setup`: 3). Für die zehn
dokumentierten Befunde funktioniert das nachweislich (Tabelle oben). Aber:
ein **neuer** axe-erkennbarer Verstoß in einer Regel, die noch **nicht** in
der Liste einer Route steht (z. B. `image-alt` oder `label` bricht morgen
auf `/queue`, das aktuell nur 2 Regeln prüft), würde **nicht** auffallen —
`withRules()` schränkt den Scan strukturell auf genau die gelisteten
Regel-IDs ein, alles andere wird gar nicht erst ausgewertet. Das Spec-Intro
(`a11y.spec.ts:9-14`) begründet das explizit mit dem
Vue-DevTools-Rauschen — aber das ist eine **vermeidbare** Begründung:

Über `@axe-core/playwright` (context7-verifiziert, `dequelabs/axe-core`,
`doc/context.md`) existiert `AxeBuilder.exclude(selector)`:

```javascript
const axe = new AxeBuilder({ page });
// Test everything except the ad banner and YouTube frames:
axe.exclude('.ad-banner, iframe[src^="youtube.com"]');
```

Der komplette Grund für die enge `rules`-Schnittführung — "der
Vue-DevTools-Anker-Button löst auf jeder Route/jedem Zustand identisch
`aria-prohibited-attr`+`region` aus" (`04-a11y.md:697-705`, per Node-Inspektion
verifiziert als `.vue-devtools__anchor-btn`) — ist ein **einzelner,
identifizierbarer Knoten**. Ein
`new AxeBuilder({ page }).exclude('.vue-devtools__anchor-btn').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()`
(oder sogar komplett unrestricted `.analyze()` mit demselben `.exclude()`)
würde das dokumentierte Rauschen gezielt unterdrücken, ohne den Scan-Umfang
für alle anderen, noch unbekannten Regelverstöße zu beschneiden — eine
strikt größere Abdeckung als das aktuelle Allowlist-Muster, bei
vermutlich gleichem oder geringerem Wartungsaufwand (kein manuelles
Nachpflegen der `rules`-Arrays bei jedem neuen Fix mehr nötig). Das ist eine
konkrete, im Bericht selbst schon angelegte Verbesserungsmöglichkeit, aber
außerhalb des Scopes dieser Bestandsaufnahme (kein Fix).

Zusätzlich: `/now-playing` ist **komplett außerhalb** der axe-Scan-Schleife
(`routes`-Array, `a11y.spec.ts:64-98`) — es hat nur den gezielten
`<main>`-Zähl-Test (Befund #9), nie einen `.analyze()`-Lauf. Jeder neue,
rein axe-erkennbare Verstoß auf dieser Route (z. B. ein neuer
Kontrastfehler) würde von keinem der bestehenden Tests gefangen.

**Für die sieben nicht-axe-erkennbaren Befunde** (#1, #2, #3, #6, #8, #9, #10
— Fokus-Management, Escape-Handling, Opacity-bei-Fokus, `aria-valuetext`,
Roving-Tabindex, Landmark-Abwesenheit, doppelte Live-Region): Hier ist die
Breite von `a11y.spec.ts` **irrelevant** — axe prüft statische
ARIA-Attribut-Validität und berechnete Eigenschaften zum Scan-Zeitpunkt,
nicht "was passiert nach einer echten Tastatureingabe" oder "ist dieses
fokussierte Element durch eine Elternklasse visuell unsichtbar". Das
bestätigt `04-a11y.md`s eigener unrestricted-Scan
(`04-a11y.md:691-705`): Befund #3 (Opacity-Overlay) taucht dort **nicht**
in der axe-Tabelle auf, obwohl der unrestricted Scan über alle 6 Routen in 3
Zuständen lief — er wurde ausschließlich manuell per Screenshot/
`getComputedStyle`-Read gefunden. Diese Befundklasse ist für axe
**strukturell unsichtbar**, egal wie breit man den Regelsatz macht.

---

## Ehrliche Antwort: Fängt die Suite ein neues, strukturgleiches Befund-#3-Muster morgen?

**Nein — weder durch axe (auch nicht unrestricted) noch durch die
bestehenden gezielten Tests.** Beide bestehenden Tests für Befund #3
(`a11y.spec.ts:292-338`) sind über `data-testid`/`getByTestId` exakt auf
`AlbumCard`/`AlbumListRow` verdrahtet — ein drittes, morgen neu gebautes
Component mit demselben Muster (`opacity-0` + `group-hover:opacity-100`
ohne `focus`/`group-focus-within`-Äquivalent, z. B. eine neue
Playlist-Card oder eine Artist-Hover-Karte) würde von **keinem** der beiden
existierenden Tests erfasst, weil sie testid-gebunden auf die zwei
bekannten Komponenten sind, nicht auf das Muster selbst. Und da axe
Fokus+Opacity-Interaktion grundsätzlich nicht prüft (bestätigt durch
`04-a11y.md`s eigenen unrestricted Scan, der Befund #3 verfehlte), würde
auch ein beliebig breiterer axe-Regelsatz nichts ändern.

Das ist die gleiche Struktur wie bei den anderen sechs
nicht-axe-erkennbaren Befunden (#1, #2, #6, #8, #9, #10) — jeder Test ist
ein gezielter, komponentenspezifischer Playwright-Assert, kein
architektonischer Guard, der automatisch für neue Komponenten mit demselben
Fehlermuster gilt. **Eine Ausnahme**: Befund #2 (`Popover.vue`) ist als
Fix in der **gemeinsamen Primitive** gelandet, nicht pro Verbraucher — jeder
zukünftige `Popover`-Konsument erbt Escape-Handling + Fokus-Rückgabe
automatisch, strukturell, auch ohne eigenen Test (der bestehende Test deckt
nur den Queue-Overflow-Konsumenten ab, aber der Fix selbst ist
konsumenten-unabhängig). Für #1, #3, #6, #8, #9, #10 gilt das nicht — dort
liegt der Fix jeweils in der konkreten Komponente selbst (`UserSelectDialog`,
`AlbumCard`/`AlbumListRow`, `ProgressBar`, `LibraryView`, `NowPlayingView`,
`VolumeControl`), ohne gemeinsame Basis, die neue Geschwisterkomponenten
automatisch erben würden.

**Fazit**: Für diese Fehlerklasse (Fokus-Sichtbarkeit durch
Eltern-Opacity/-state-Klassen) braucht es weiterhin ein manuelles Audit
oder eine bewusste Linting-/Review-Konvention (z. B. eine Code-Review-Regel:
"jedes `group-hover:opacity-*` braucht ein `group-focus-within:opacity-*`-
Gegenstück") — die automatisierte Suite in ihrer jetzigen Form (egal ob
`withRules` oder unrestricted `.analyze()`) bietet dafür keinen
strukturellen Schutz.
