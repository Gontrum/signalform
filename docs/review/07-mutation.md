# 07 — Mutation-Testing: Wo sind Tests grün, aber fangen nichts?

Ziel dieses Reports: **eine einmalige Messung**, kein Dauer-Tooling, keine
Test-Reparatur. Stryker wurde temporär installiert, an einem Modul
ausgeführt und danach vollständig wieder entfernt (`git status` ist clean,
`pnpm-lock.yaml` und `packages/backend/package.json` sind auf dem
Ausgangsstand). Es wurden **keine Test- oder Source-Dateien verändert** —
nur dieser Report ist neu.

## Kurzfassung

Score am gewählten Modul: **80 % (24/30 Mutanten getötet)**. Von den 6
Überlebenden ist **1 ein echter Äquivalent-Mutant** (kein Fund), **5 sind
echte Lücken** — und alle 5 laufen auf dasselbe Muster hinaus: die Tests
prüfen **Reihenfolge, nie den tatsächlichen Score-Wert**, und die
Testdaten sind zufällig schon so sortiert, dass eine kaputte
Sortierung/Merge-Logik nicht auffällt. Das ist exakt das
"grün-aber-fängt-nichts"-Muster, nach dem gesucht wurde.

Empfehlung vorweg (Begründung in SCHRITT 4): **Keine dauerhafte
Score-Gate-Pipeline.** Diese eine Messung als Weckruf reicht — die drei
konkreten Testlücken unten sind das eigentliche Ergebnis, nicht die
Infrastruktur.

---

## SCHRITT 1 — Modulwahl

Kandidaten waren alle `core/`-Verzeichnisse in `backend` und `frontend`
(shared hat kein `core/`-Unterverzeichnis, siehe unten). Gemessen wurde
Quellcode- und Testdatei-Größe pro Modul:

| Modul                           | src (Zeilen)    | test (Zeilen) | Testdateien |
| ------------------------------- | --------------- | ------------- | ----------- |
| `backend/search/core`           | 725             | 2343          | 2           |
| `backend/radio-mode/core`       | 982             | 1355          | 5           |
| `backend/source-hierarchy/core` | 328             | 758           | 1           |
| `backend/playback/core`         | 281             | 610           | 2           |
| `backend/metadata/core`         | 264             | 314           | 1           |
| `backend/personal-radio/core`   | 200 (2 Dateien) | 320           | 2           |
| `backend/setup/core`            | 200             | 310           | 1           |
| `backend/users/core`            | 184             | 302           | 1           |
| `backend/tidal-albums/core`     | 146             | 224           | 1           |
| `backend/artist-radio/core`     | 139             | 353           | 1           |

Gewählt: **`packages/backend/src/features/personal-radio/core/artist-scorer.ts`**
(89 Zeilen, Testdatei 129 Zeilen, 10 Testfälle).

Begründung anhand der drei geforderten Kriterien:

- **(a) Logik-lastig, kein Glue-Code**: Die Funktion `scoreArtistsFromHistory`
  aggregiert drei Last.fm-Quellen mit unterschiedlichen Gewichten (+3/+3/+1),
  dedupliziert case-insensitiv, sortiert nach Score und schneidet auf ein
  Limit zu. Das ist ein Algorithmus mit Branches, Arithmetik und einer
  Sortierung — nicht nur Typumwandlung oder Datenweiterreichen wie z. B.
  `config/core` oder `lms-wake/core`.
- **(b) Functional Core**: Liegt in `core/`, keine Imports aus `vue` oder
  `fastify`, kein `await`, `readonly`-Typen durchgehend (`ArtistScoreEntry`).
  Reine Funktionen sind für Mutation-Testing am aussagekräftigsten, weil
  jede Mutation deterministisch nachvollziehbar ist — kein Mocking, keine
  Nebenwirkungen, die einen Mutanten zufällig "retten".
- **(c) Klein und schnell**: 89 Zeilen Source, 10 Testfälle, keine
  I/O-Wartezeiten. Das benachbarte `seed-merger.ts` (111 Zeilen) im selben
  Feature wäre auch ein Kandidat gewesen, aber `artist-scorer.ts` ist die
  kleinere, in sich geschlossenere Einheit (eine exportierte Funktion +
  ein privater Helper) und wurde deshalb bevorzugt.

Verworfen: `search/core` und `radio-mode/core` — mit 2343 bzw. 1355
Testzeilen wäre schon ein Lauf an einem einzelnen Modul im Minuten- bis
Zweistelligminutenbereich gelandet, was dem Ziel "Lauf dauert Minuten,
nicht Stunden" für einen ersten Testlauf widerspricht.

---

## SCHRITT 2 — Lauf und Ergebnis

### Setup

Stryker wurde **nur temporär** als Dev-Dependency in `packages/backend`
installiert (`@stryker-mutator/core@9.6.1`,
`@stryker-mutator/vitest-runner@9.6.1`), mit folgender Config (danach
wieder gelöscht):

```json
{
  "packageManager": "pnpm",
  "plugins": ["@stryker-mutator/vitest-runner"],
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts" },
  "mutate": ["src/features/personal-radio/core/artist-scorer.ts"],
  "reporters": ["clear-text", "json"],
  "coverageAnalysis": "perTest",
  "concurrency": 2
}
```

`mutate` war bewusst auf die eine Datei begrenzt, nicht auf das ganze
Feature oder gar `src/**` — genau das hält den Lauf klein.

### Ergebnis

```
Ran 4.57 tests per mutant on average.
------------------|------------------|----------|-----------|------------|----------|----------|
                  | % Mutation score |          |           |            |          |          |
File              |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
------------------|--------|---------|----------|-----------|------------|----------|----------|
All files         |  80.00 |   80.00 |       24 |         0 |          6 |        0 |        0 |
 artist-scorer.ts |  80.00 |   80.00 |       24 |         0 |          6 |        0 |        0 |
------------------|--------|---------|----------|-----------|------------|----------|----------|
```

30 Mutanten gesamt, Laufzeit ~5 Sekunden (Instrumentierung + Dry-Run +
alle Mutanten). Vollständiger Bericht lag unter
`packages/backend/reports/mutation/mutation.json` (wurde mit dem Rest des
Setups entfernt; Rohdaten der überlebenden Mutanten sind unten
vollständig zitiert).

### Kategorisierung der 6 überlebenden Mutanten

| #   | Zeile                 | Mutation                                  | Kategorie              |
| --- | --------------------- | ----------------------------------------- | ---------------------- |
| 1   | `artist-scorer.ts:30` | `toLowerCase()` → `toUpperCase()`         | **Äquivalent**         |
| 2   | `artist-scorer.ts:34` | Ternary → `true`                          | **Schwache Assertion** |
| 3   | `artist-scorer.ts:34` | Ternary → `false`                         | **Schwache Assertion** |
| 4   | `artist-scorer.ts:85` | `.sort(cb)` entfernt                      | **Echte Test-Lücke**   |
| 5   | `artist-scorer.ts:86` | Comparator → `() => undefined`            | **Echte Test-Lücke**   |
| 6   | `artist-scorer.ts:86` | `b.score - a.score` → `b.score + a.score` | **Echte Test-Lücke**   |

### Die 5 lehrreichsten Funde

**1. Äquivalenter Mutant — `toLowerCase()` → `toUpperCase()` (Zeile 30)**

```ts
// packages/backend/src/features/personal-radio/core/artist-scorer.ts:30
const key = name.toLowerCase(); // Mutant: name.toUpperCase()
```

`key` wird **nie zurückgegeben** — nur `name` (Zeile 34/38, Original-Schreibweise)
landet im Ergebnis. `key` dient ausschließlich als interner Vergleichsschlüssel
für `.find()`/`.map()`-Gleichheit. Da `toUpperCase()` genauso deterministisch
und konsistent ist wie `toLowerCase()`, ändert die Mutation das
beobachtbare Verhalten für keinen Input aus der Testsuite. Das ist ein
**echter Äquivalent-Mutant** — kein Testlücken-Vorwurf, sondern ein
Statement über den Code: `key` könnte genauso gut nicht case-gefaltet,
sondern nur normalisiert-verglichen werden; es gibt keine Testlücke zu
schließen, ohne den Sinn des Tests zu verbiegen (z. B. `key` exportieren,
nur um ihn prüfbar zu machen — nicht sinnvoll).

**2+3. Schwache Assertion — Merge-Ternary immer `true`/`false` (Zeile 34)**

```ts
// packages/backend/src/features/personal-radio/core/artist-scorer.ts:34
s.key === key ? { ...s, score: s.score + delta } : s,
// Mutant A: true  ? ...  → JEDER Eintrag bekommt +delta, nicht nur der Treffer
// Mutant B: false ? ...  → der Treffer bekommt NIE +delta (No-Op)
```

Beide Mutanten überleben aus demselben Grund: **kein Test prüft den
tatsächlichen Score-Wert**, nur die Reihenfolge des Ergebnisses
(`result[0]`, `result[1]`, `toHaveLength`). Im bestehenden Test
"only loved artists" (`lovedArtists: ["Radiohead", "Portishead", "Radiohead"]`)
sollte Radiohead nach korrektem Merge 6 Punkte haben, Portishead 3 — bei
Mutant B bleibt Radiohead bei 3 (kein zweiter Merge), also 3:3 Gleichstand.
JS-`Array.sort` ist stabil, und Radiohead wurde zuerst eingefügt — der
Gleichstand landet zufällig in derselben Reihenfolge wie das korrekte
Ergebnis. Der Test sieht `["Radiohead", "Portishead"]` so oder so.

Reproduziert und verifiziert (Node, gleiche Merge-Logik nachgebaut):

```
correct:     [ 'A', 'B' ]
mutant true:  [ 'B', 'A' ]
mutant false: [ 'B', 'A' ]
```

mit Eingabe `lovedArtists: ["B","A"], recentTopArtists: ["A"]` — hier
weicht die falsche Reihenfolge sichtbar vom korrekten Ergebnis ab, weil
B zuerst eingefügt wurde, aber A nach dem Merge höher stehen muss.

Konkreter Fix (Testdatei):

```diff
--- a/packages/backend/src/features/personal-radio/core/artist-scorer.test.ts
+++ b/packages/backend/src/features/personal-radio/core/artist-scorer.test.ts
@@
   test("artist in all three sources → 3+3+1=7 pts", () => {
     ...
   });

+  test("merge bumps only the matching artist, not its siblings", () => {
+    const result = scoreArtistsFromHistory({
+      lovedArtists: ["B", "A"], // both start at 3; B is inserted first
+      recentTopArtists: ["A"], // only A should be bumped to 6
+      overallTopArtists: [],
+    });
+    // If the merge bumped every entry (or none), the stable sort would
+    // keep insertion order ["B", "A"] instead of score order ["A", "B"].
+    expect(result).toEqual(["A", "B"]);
+  });
+
   test("limit default 8: returns at most 8 artists", () => {
```

**4+5+6. Echte Test-Lücke — Sortierung wird nie wirklich geprüft (Zeilen 85–86)**

```ts
// packages/backend/src/features/personal-radio/core/artist-scorer.ts:85-86
return [...allScores]
  .sort((a, b) => b.score - a.score) // Mutant: .sort() entfernt, oder
  .slice(0, limit) // Comparator → () => undefined, oder
  .map((s) => s.name); // b.score - a.score → b.score + a.score
```

Alle drei Mutationen degradieren die Sortierung effektiv zu einem
No-Op — verifiziert in Node (V8, Array mit drei unterschiedlichen Scores
in Einfüge-Reihenfolge `[Zeta=3, Mid=2, Alpha=4]`):

```
3-elem correct (b.score - a.score):        [ 'Alpha', 'Zeta', 'Mid' ]
3-elem sum-comparator (b.score + a.score):  [ 'Zeta', 'Mid', 'Alpha' ]
3-elem noop-comparator (() => undefined):   [ 'Zeta', 'Mid', 'Alpha' ]
```

Beide kaputten Varianten fallen auf **Einfüge-Reihenfolge** zurück. Der
bestehende Test "sorting: higher score comes first" konstruiert aber genau
den Fall, in dem Einfüge-Reihenfolge und Score-Reihenfolge zufällig
übereinstimmen (`lovedArtists: ["Alpha"]` zuerst, `overallTopArtists`
zuletzt mit dem niedrigsten Score `Gamma`) — die Assertions
(`toContain`, `result[result.length - 1]`) unterscheiden nie zwischen
"richtig sortiert" und "zufällig schon richtig eingefügt". Das ist eine
**echte Testlücke**: kein Testfall widerspricht Einfüge-Reihenfolge und
Score-Reihenfolge absichtlich.

Konkreter Fix (Testdatei):

```diff
--- a/packages/backend/src/features/personal-radio/core/artist-scorer.test.ts
+++ b/packages/backend/src/features/personal-radio/core/artist-scorer.test.ts
@@
   test("sorting: higher score comes first across mixed sources", () => {
     ...
   });
+
+  test("sort is driven by score, not by insertion order", () => {
+    const result = scoreArtistsFromHistory({
+      lovedArtists: ["Zeta"], // score 3, inserted first
+      recentTopArtists: [],
+      overallTopArtists: ["Alpha", "Alpha", "Alpha", "Alpha"], // score 4, inserted last
+    });
+    // Alpha (4) must sort before Zeta (3) even though Zeta was inserted
+    // first — a no-op or reversed comparator would return ["Zeta", "Alpha"].
+    expect(result).toEqual(["Alpha", "Zeta"]);
+  });
```

Diese eine zusätzliche Testcase tötet alle drei Sortier-Mutanten (4, 5, 6) gleichzeitig, weil sie den einen Fall abdeckt, den die bestehende Suite
komplett ausspart.

---

## SCHRITT 3 — Hochrechnung (keine Durchführung)

**Ist 80 % gut oder schwach für dieses Modul?** Schwach, aber irreführend
schwach: 5 von 6 Lücken sind ein einziges Muster (Reihenfolge statt
Wert/Score prüfen), keine 6 unabhängigen Lücken. Mit den zwei oben
gezeigten Testfällen ginge der Score von 80 % auf 100 % (24+3 von 30 —
die 5 echten Lücken wären geschlossen, der 1 Äquivalent-Mutant bleibt
naturgemäß "survived" und zählt nicht gegen die Suite).

**Was sagt das über den Rest der Suite?** Das Muster
"Assertion prüft Reihenfolge/Länge, nie den Wert" ist wahrscheinlich kein
Einzelfall — `seed-merger.ts` im selben Feature hat eine strukturell
ähnliche Merge-Funktion, und andere Scoring-/Sortier-Module
(`artist-radio/core`, `radio-mode/core`) haben laut Namen ähnliche
Aggregations-Logik. Das ist eine Vermutung, kein Fund — dafür müsste man
diese Module tatsächlich mutieren, was hier bewusst nicht gemacht wurde.

**Aufwandsschätzung für einen Voll-Repo-Lauf:**

Gemessene Eckdaten:

| Größe                                                   | Wert                                |
| ------------------------------------------------------- | ----------------------------------- |
| Core-Testdateien gesamt (backend+frontend+shared)       | 36 (26+6+4)                         |
| Nicht-Core-Testdateien (Shell/Integration/Component)    | 135 (55 backend + 80 frontend)      |
| Core-Quellzeilen gesamt (backend+frontend+shared)       | ≈ 5.841 (4.082 + 1.189 + 570)       |
| Backend-Gesamtsuite (`pnpm --filter backend test:unit`) | 81 Dateien, 1.723 Tests, **7,86 s** |
| Dieser Lauf: 89 Zeilen → 30 Mutanten in ~5 s            | Referenzpunkt                       |

Naive lineare Hochrechnung (Mutanten/Zeile × Gesamt-Core-Zeilen):
30/89 ≈ 0,34 Mutanten/Zeile × 5.841 Zeilen ≈ **~1.970 Mutanten**.

Das ist aber die **untere** Grenze, keine verlässliche Schätzung, aus
einem konkreten, im Log sichtbaren Grund: Der Dry-Run für
`artist-scorer.ts` lief nicht nur gegen dessen eigene 10 Unit-Tests,
sondern zog automatisch `server.test.ts` (7 Tests, echter Fastify-Boot)
und die Personal-Radio-Integrationstests mit rein — weil `server.ts`
alle Feature-Routen registriert und damit transitiv jedes Core-Modul
importiert. Ein Modul, das (wie hier) über die Server-Registrierung
"zentral" verdrahtet ist, zieht bei jeder Mutation potenziell einen
großen Teil der 1.723 Backend-Tests inklusive echter I/O-lastiger
Integrationstests nach sich — nicht nur die schnellen 6–20 Unit-Tests,
die in diesem Lauf pro Mutant tatsächlich reichten.

Mit nur einem sauberen Messpunkt lässt sich diese Fan-out-Dynamik nicht
seriös in eine einzige Zahl pressen. Realistische Bandbreite:

- **Optimistisch** (Coverage-Analyse hält Reruns so eng wie hier):
  ~1.970 Mutanten × ~150 ms ≈ **~5 Minuten** reine Testlaufzeit, plus
  Instrumentierungs-Overhead pro der ~38 Module (Setup, Dry-Run) — real
  eher 30–60 Minuten.
- **Pessimistisch** (große, zentral verdrahtete Module wie `radio-mode`
  oder `search` ziehen einen Großteil der 1.723 Tests je Mutant nach
  sich, ähnlich dem hier beobachteten Server-Test-Fan-out): einzelne
  Module könnten allein mehrere Minuten pro Modul kosten, in Summe
  **2–6 Stunden** für einen vollständigen Core-Sweep über
  backend+frontend.

Die Spanne ist bewusst breit — das ist der Punkt: mit einem Datenpunkt
lässt sich nicht seriös zwischen "30 Minuten" und "6 Stunden"
unterscheiden, und genau deshalb sollte kein voller Lauf ohne gezielte
Zwischenmessung an 2–3 weiteren, unterschiedlich stark verdrahteten
Modulen gestartet werden.

---

## SCHRITT 4 — Empfehlung

**Reicht die einmalige Messung als Weckruf. Kein dauerhafter
Harness-Baustein.**

Begründung, ohne Sowohl-als-auch:

1. **Das eigentliche Problem ist gefunden, nicht die Infrastruktur.** Der
   Fund aus SCHRITT 2 ("Assertions prüfen Reihenfolge, nie den Wert") ist
   ein Review-Ergebnis, das man in einen PR-Kommentar oder eine
   Checklisten-Regel gießen kann ("bei Scoring/Merge-Logik: Testfälle
   MÜSSEN einen Fall enthalten, in dem Einfüge-Reihenfolge und
   Ergebnis-Reihenfolge auseinanderfallen"). Dafür braucht es kein
   laufendes Tool — das ist eine Regel für Code-Review und für
   `@core-dev`-Prompts, keine CI-Gate-Frage.
2. **Der Fan-out über `server.ts` macht ein Diff-Gate teuer und fragil.**
   Ein "nur auf dem Diff mutieren"-Gate müsste pro PR erst herausfinden,
   welche Core-Module betroffen sind, und würde bei jedem Core-Modul, das
   über die Server-Registrierung mit dem Rest verdrahtet ist (praktisch
   alle backend `core/`-Module), einen erheblichen Teil der 1.723 Tests
   pro Mutant erneut ausführen — siehe die 2–6-Stunden-Pessimismus-Zahl
   oben. Das ist kein Rand-Fall, sondern die Regel in diesem
   Server/Feature-Layout.
3. **Die Suite ist mehrheitlich Shell/Integration, nicht Core.** 135 von
   171 Testdateien (79 %) liegen außerhalb von `core/`. Ein
   Mutation-Score-Gate, das nur auf reinen Core-Funktionen sauber
   funktioniert (siehe FCIS-Doktrin des Projekts), deckt damit strukturell
   nur einen kleinen Teil der Codebasis ab — für den größeren Teil
   (Fastify-Handler, Vue-Komponenten) ist Mutation-Testing ohnehin nicht
   das richtige Werkzeug (I/O, Framework-Code, Mocking-Overhead).
4. **Kein zweiter Beleg für ein wiederkehrendes, noch unentdecktes
   Muster.** Eine dauerhafte Gate-Investition lohnt sich, wenn wiederholt
   neue Instanzen desselben Fehlers auftauchen. Hier gibt es genau einen
   Messpunkt mit einem klaren, aber punktuellen Befund — kein Trend über
   Zeit, der ein automatisiertes Gate rechtfertigen würde.

Was ich stattdessen tun würde, **wenn** gewünscht (nicht Teil dieser
Messung): die zwei oben gezeigten Testfälle in `artist-scorer.test.ts`
ergänzen (das wäre ein separater, expliziter Auftrag — hier bewusst nicht
gemacht, siehe Regeln), und die Review-Erkenntnis ("Reihenfolge ≠ Wert
prüfen") als Kriterium in den `@core-dev`-Test-Checklisten in `CLAUDE.md`
aufnehmen.
