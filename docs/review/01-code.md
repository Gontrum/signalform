# 01 — Architektur- und Konsistenzreview

Scope: `packages/shared`, `packages/backend`, `packages/frontend`.
Methode: `pnpm run review:collect` (Artefakte in `.review-artifacts/`) +
gezielte LSP-/Grep-Verifikation einzelner Fundstellen. Keine Produktionsdatei
geändert.

## Executive Summary

Die FCIS-Grenze (core/shell) ist über `eslint-plugin-boundaries` +
dependency-cruiser tatsächlich hart durchgesetzt und wird von 0
Dependency-Verstößen bestätigt (A). Eine echte Lücke bleibt: `Math.random()`
in einer als "core" deklarierten Funktion (A, Kap. Architekturgrenzen).
Typsicherheit ist da, wo Zod an der HTTP-Grenze eingesetzt wird, gut — aber
inkonsistent: die `queue`- und `playback/tidal-routes`-Routen validieren
Bodies manuell statt mit Zod wie die übrigen 17 Routen (A). `Result<T,E>`
wird an einer Stelle strukturell neu erfunden statt aus `shared` importiert
(A). `check:dupes` (jscpd) läuft zwar in `review:collect`, ist aber **nicht**
Teil von `precommit` — 21 Klone haben sich unbemerkt angesammelt (A). Kein
toter Code (knip: 0 Findings) und keine Importzyklen (A) — beides sauber und
sollte so bleiben.

## Architekturgrenzen

**(A) Belegt durch Tooling:**

- `pnpm run check:arch` (depcruise) meldet für alle drei Pakete
  `no dependency violations found` (`.review-artifacts/check-arch.txt:2,5,8`).
- depcruise selbst prüft nur zwei Dinge: Importzyklen und Node-Builtin-Importe
  in `core/` (`.dependency-cruiser.cjs:15-31`). Die eigentliche
  core→shell-Sperre liegt in `eslint-plugin-boundaries`
  (`packages/backend/eslint.config.js:51-82`,
  `packages/frontend/eslint.config.js:108-131`).
- Zusätzliche Core-Härtung per ESLint: kein `throw`/`try`
  (`functional/no-throw-statements`, `functional/no-try-statements`), kein
  `fetch`-Global, kein `await`/`async`, kein Import von `fastify`/`vue`/
  `pinia`/`vue-router`/`shell/**` (`packages/backend/eslint.config.js:103-148`,
  `packages/frontend/eslint.config.js:134-174`).
- Diese Regeln decken **fetch, await, throw, Framework-Importe** ab — aber
  nicht andere Seiteneffekt-Quellen (Zufall, Zeit, globaler Zustand). Gezielte
  Suche nach `Date.now()`/`new Date(`, `setTimeout`/`setInterval`, `crypto.`
  und modul-globalem `Map`/`WeakMap`/`Set` in allen `core/`-Verzeichnissen
  beider Pakete: **ein Treffer, kein Fehlalarm sonst.**
  - `packages/backend/src/features/personal-radio/core/seed-merger.ts:117`
    — `fisherYatesShuffle` (exportiert `:113`) verwendet `Math.random()`
    direkt in einer als Core deklarierten, exportierten Funktion. Kein
    ESLint-Rule verbietet das (nur `fetch` ist als Global gebannt). Die
    Funktion ist dadurch nicht deterministisch testbar — der zugehörige Test
    (`packages/backend/src/features/personal-radio/core/seed-merger.test.ts:198-215`)
    prüft folgerichtig nur Länge/Fallback-Fälle, nie eine konkrete
    Ausgabe-Reihenfolge.
  - Gegenprobe `packages/backend/src/features/lastfm-auth/core/service.ts:1`
    — `new Set([...])` auf Modulebene sieht wie globaler State aus, ist aber
    eine nie mutierte Konstante (Lookup-Tabelle für Signatur-Parameter,
    verwendet in `buildSignature` `:8-19`). Kein Fund, zur Vollständigkeit
    genannt.

**(B) Einschätzung:** `Math.random()` in `core/` ist der einzige Ort, an dem
die "Functional Core"-Garantie (deterministisch, pure) faktisch nicht mehr
stimmt. Aufwand zur Behebung ist klein: `fisherYatesShuffle` einen
`random: () => number`-Parameter geben (Default in der Shell via
`Math.random`) — Pattern existiert im selben Package bereits für Hashing
(`buildSignature` in `lastfm-auth/core/service.ts:8-11` bekommt die
Hash-Funktion injiziert statt sie selbst zu importieren).

## Inkonsistenzen nach Konzept

### Fehlerbehandlung / Result-Typen

**(A)** Kanonischer Typ: `packages/shared/src/result/index.ts:1-3`
(`{ok:true, value:T} | {ok:false, error:E}`), mit Hilfsfunktionen `ok`/`err`/
`isOk`/`isErr`/`map`/`flatMap`/`mapErr`/`unwrap`/`unwrapOr`/`fromThrowable`
(`:6-83`).

`packages/backend/src/features/queue/shell/queue-removal-service.ts:69-71`
definiert einen eigenen, strukturell ähnlichen, aber abweichenden Typ:

```ts
export type QueueRemovalResult =
  | { readonly ok: true; readonly queueProjection?: QueueProjection }
  | { readonly ok: false; readonly error: LmsError };
```

Abweichung vom Shared-Typ: Erfolgsfeld heißt `queueProjection` statt `value`
und ist optional statt Pflichtfeld. Folge: Keiner der Shared-Helfer
(`isOk`, `map`, `flatMap`, `unwrap`) ist auf `QueueRemovalResult` anwendbar —
Aufrufer (`packages/backend/src/features/queue/shell/route.ts`, `.ok`-Checks
z. B. um `:390-450`) müssen das Feld erneut von Hand destrukturieren.

**(B)** Kein Blocker, aber ein wiederkehrender Reibungspunkt: jede neue
Stelle, die `handleQueueRemoval` konsumiert, muss die abweichende Form
kennen statt sich auf den Shared-Vertrag verlassen zu können.

### Validierung von HTTP-Bodies

**(A)** 17 Backend-Shell-Routen validieren Request-Bodies mit Zod-Schemas,
z. B. `packages/backend/src/features/genre-radio/shell/route.ts:14`:

```ts
const bodySchema = z.object({ genreName: z.string().min(1).max(100) });
```

(vollständige Liste der Zod-Nutzer: `artist-radio`, `tag-search`,
`lastfm-love`, `config`, `genre-radio`, `lastfm-auth`, `setup`, `library`,
`tidal-artists`, `search`, `playback/tidal-routes`, `playback/status-routes`,
`playback/transport-routes`, `users`, `enrichment`, `tidal-albums`,
`metadata` — je `shell/route*.ts`).

Zwei Stellen validieren stattdessen von Hand mit einem eigenen
Type-Guard + Feld-für-Feld-Prüfung:

- `packages/backend/src/features/queue/shell/route.ts:75-77` definiert
  `isBodyRecord` und nutzt es 8× (`:169,206,248,277,317,358,391,448`,
  `.ok`-Wert je danach separat geprüft). Beispiel `/api/queue/add`
  (`:205-229`): manueller Typ-Check, `trim()`, Längenprüfung (`> 2048`),
  Protokoll-Allowlist — vier Handschrift-Validierungsschritte, die Zod in
  einer Zeile abdecken würde (`z.string().trim().min(1).max(2048)` +
  `refine`).
- `packages/backend/src/features/playback/shell/tidal-routes.ts:30` definiert
  dieselbe Prüfung nochmal als `isBodyRecord`.

Das exakt gleiche Prädikat `typeof value === "object" && value !== null`
taucht als `isRecord`/`isBodyRecord` in **20 Dateien** unabhängig
voneinander auf (Produktionscode + Integrationstests), u. a.:
`lastfm-auth/shell/route.ts:28`, `search/shell/route.ts:41`,
`adapters/lastfm-client/client.ts:31`, `adapters/fanart-client/client.ts:17`,
`adapters/lms-client/execute.ts:20` (hier bereits `export`et, also technisch
importierbar), plus 9 `*.integration.test.ts`-Dateien. Kein einziger
Aufrufer importiert `execute.ts`s exportierte Version — jede Datei rollt
ihre eigene.

**(B)** Die Queue-Routen sind mit 579 Zeilen (`route.ts`) + 230 Zeilen
(`queue-removal-service.ts`) der mit Abstand größte Endpunkt-Block im
Backend und der einzige größere, der nicht auf Zod umgestellt wurde —
vermutlich historisch gewachsen, bevor Zod Konvention wurde. Migration ist
mechanisch (Schema pro Endpoint, kein Verhaltensunterschied), aber wegen der
Menge an Endpunkten (8) kein Quick-Fix.

### Naming

**(A)** Gleiches Konzept, zwei Namen: `isRecord` (17 Fundstellen) vs.
`isBodyRecord` (2 Fundstellen, beide HTTP-Body-spezifisch, aber identische
Implementierung wie `isRecord`). Keine der beiden Varianten liegt an einem
Ort, der laut Boundary-Konfiguration für geteilte technische Helfer
vorgesehen ist (`shared-technical`-Elemente sind in
`packages/backend/eslint.config.js:16-24` explizit als
`src/infrastructure/config/**`, `logger.ts`, `normalizeArtist.ts`,
`http-errors.ts` aufgezählt — ein `is-record.ts` fehlt dort).

## Typsicherheit nur nominell

**(A)** Kein einziges `eslint-disable` für `no-explicit-any` oder
`no-unsafe-type-assertion` im gesamten Produktionscode gefunden (Grep über
`packages/*/src`, Tests ausgeschlossen) — die beiden strengsten Regeln
(`packages/eslint.config.js:69,79`) werden nicht umgangen. `type-coverage`
bestätigt hohe, aber nicht perfekte Abdeckung:
`.review-artifacts/check-any.txt:1-6` — shared 100.00 %, backend 99.49 %
(78007/78400), frontend 97.52 % (49936/51204). Die Lücke wurde nicht Zeile
für Zeile aufgelöst (type-coverage liefert keine Fundstellenliste im
Text-Report) — für eine erschöpfende Liste bräuchte es `type-coverage
--detail`, nicht ausgeführt (Kontext fehlt für eine vollständige Aussage).

Zwei konkret geprüfte Cast-Stellen:

- `packages/backend/src/features/queue/shell/route.ts:154` und `:509`:
  `_request as FastifyRequest`. Der Parameter heißt `_request` (Konvention
  für "ungenutzt"), wird aber tatsächlich an `sendLmsError`
  (`packages/backend/src/infrastructure/http-errors.ts:29-34`, Parameter
  `request: FastifyRequest`) übergeben. Da Fastifys `.get`/`.post`-Handler
  den Parameter bereits als `FastifyRequest` typisieren, ist der Cast
  vermutlich redundant (Copy-Paste-Rest von einer Route, wo der Parameter
  wirklich ungenutzt war). **(B)** Nicht mit `tsc` verifiziert, ob der Cast
  bei Entfernung wirklich folgenlos bleibt — dafür müsste testweise editiert
  und `pnpm --filter backend type-check` laufen, was hier bewusst
  unterlassen wurde (keine Produktionsdatei ändern).
- `packages/backend/src/features/setup/shell/discovery.ts:33-35`: Cast von
  `networkInterfaces()` (Node `os`-Modul) auf
  `Readonly<Record<string, readonly NetworkInterfaceEntry[] | undefined>>`.
  `NetworkInterfaceEntry` (`packages/backend/src/features/setup/core/discovery-parsers.ts:34-38`)
  ist ein striktes Subset der echten Node-Felder (`address`, `netmask`,
  `family` — ohne `mac`, `internal`, `cidr`, `scopeid`). Strukturell sollte
  das ohne Cast durchgehen; dass einer nötig war, deutet auf eine
  Optionality-/Index-Signatur-Abweichung zwischen `NodeJS.Dict<...>` und
  `Record<string, ... | undefined>` hin. **(B)** Praktisch unkritisch (Subset
  ist sicher), aber ein Cast an der einzigen echten OS-Grenze im Codebase,
  der nicht durch einen Type-Guard abgesichert ist — falls Node das Shape
  je ändert, fiele das still durch.
- HTTP-Request-Bodies: **kein** ungeprüfter Cast gefunden
  (`request.body as ...` liefert 0 Treffer). Alle Bodies laufen entweder
  durch Zod oder durch den in "Validierung" beschriebenen `isRecord`-Guard —
  beides prüft zur Laufzeit, auch wenn Letzteres schwächer typisiert ist.
- Audio-Metadaten-Parsing (ID3/ffprobe o. ä.) existiert in diesem Repo nicht
  — Signalform delegiert Dateizugriff komplett an den LMS-Server und
  verarbeitet nur dessen JSON-RPC-Antworten sowie Last.fm/Tidal-API-JSON
  (`packages/backend/src/features/metadata/core/types.ts:1-20`). Der Punkt
  "ungeprüfte Casts an Audio-Metadaten" aus dem Auftrag trifft auf diesen
  Codebase-Zuschnitt nicht zu — **hier notiert statt geraten.**

## Verständlichkeit — Top 10 kognitive Last

1. **`packages/backend/src/features/queue/shell/queue-removal-service.ts:83-229`**
   (`handleQueueRemoval`, 147 Zeilen eine Funktion). Fünf abgeleitete Boolean-Flags
   (`canAttemptRadioRemoval` `:94-97`, `shouldSuppressQueueEndForCurrentTrack`
   `:139-141`, `shouldSuppressQueueEndForRemovedTrack` `:142-144`) steuern
   verschachtelte `if`/`else if`, danach ein _fire-and-forget_
   `void promise.then().catch()` (`:165-224`) mit dreifacher Statusverzweigung
   NACH dem `return`-Pfad der Funktion. Ein neuer Entwickler stolpert, weil
   die Funktion an zwei Stellen "fertig" wirkt (Rückgabe `:227-229`), obwohl
   danach noch unbeobachtete Async-Arbeit läuft, die bei Fehlern nur geloggt
   wird.
2. Gleiche Datei, **`:132-158`** — Fernwirkung: `setSuppressedQueueEnd`
   importiert aus `../../radio-mode/shell/radio-state.ts:20-21` und mutiert
   globalen State einer _anderen_ Feature-Shell (`radio-mode`) aus der
   `queue`-Feature heraus. Die Kopplung ist nicht am Funktionsnamen ablesbar.
3. **`packages/backend/src/features/queue/shell/route.ts`** (579 Zeilen, 11
   Endpunkte). Acht davon wiederholen dasselbe Muster manuelle
   `isBodyRecord`-Prüfung → Feld holen → Feld-für-Feld validieren (siehe
   Konzept-Abschnitt oben) — die schiere Länge macht es schwer, den einen
   Endpunkt zu finden, der von der Norm abweicht.
4. **`packages/backend/src/adapters/lastfm-client/client.ts`** (825 Zeilen,
   größte Datei im Backend). jscpd findet vier interne Selbst-Klone
   (`.review-artifacts/check-dupes.txt:4-15`, Zeilenpaare
   `169↔429/438`, `569↔606`, `598↔633`, `598↔741`) — ein Indiz, dass
   Response-Mapping-Logik pro Last.fm-Endpunkt kopiert statt extrahiert
   wurde. **(B)** Nicht jede Zeile gelesen; Aussage stützt sich auf
   jscpd-Fundstellen, nicht auf vollständige manuelle Durchsicht.
5. **`packages/backend/src/features/genre-radio/shell/route.ts:14-112`** vs.
   **`packages/backend/src/features/loved-radio/shell/route.ts:13-133`** —
   jscpd meldet drei Klone zwischen 8 und 36 Zeilen
   (`.review-artifacts/check-dupes.txt:19-33`). Zwei Features mit fast
   identischer Routen-Logik (Radiomodus starten, Fehlerbehandlung, Playback)
   ohne gemeinsame Abstraktion — wer eine der beiden Routen ändert, muss
   wissen, dass die andere synchron mitgepflegt werden muss.
6. **`packages/backend/src/features/lastfm-auth/shell/route.ts`** vs.
   **`packages/backend/src/features/users/shell/route.ts`** — zwei Klone
   (`:196-206` ↔ `users/shell/route.ts:181-190` und `:112-122` ↔
   `users/shell/route.ts:130-140`,
   `.review-artifacts/check-dupes.txt:37-42`). Auth- und User-Feature teilen
   Logik, die nicht benannt/extrahiert ist — für neue Entwickler unklar, ob
   das absichtliche Nähe oder Zufall ist.
7. **`packages/backend/src/features/playback/shell/tidal-routes.ts`** vs.
   **`packages/backend/src/features/queue/shell/route.ts`** — vier Klone
   zwischen 12 und 16 Zeilen (`.review-artifacts/check-dupes.txt:49-60`),
   alle rund um LMS-Fehlerbehandlung nach Queue-Mutationen. Kombiniert mit
   Fund 3 (Queue-Route ist der Ausreißer bei der Body-Validierung) entsteht
   der Eindruck, dass `tidal-routes.ts` und `queue/route.ts` mal eine
   gemeinsame Quelle hatten, die auseinandergedriftet ist.
8. **`packages/backend/src/features/setup/shell/discovery.ts:32-37`** —
   UDP-Broadcast-Discovery mit `networkInterfaces()`-Cast (siehe
   Typsicherheit oben) direkt neben Byte-Protokoll-Konstanten (`:24-27`,
   Magic Bytes `0x65, 0x49, ...`). Wer hier debuggt, braucht Kontext zu drei
   Ebenen gleichzeitig (Node-OS-API, UDP-Wireformat, LMS-JSON-RPC weiter
   unten in derselben Datei) ohne Kommentar, der die drei Ebenen trennt.
9. **`packages/backend/src/features/personal-radio/shell/route.ts:95-125`**
   — zwei parallele `Promise.all`-"Kanäle" (Kommentare `Kanal A`/`Kanal B`,
   deutsch inmitten von sonst englischem Code) mit bedingter dritter Quelle
   (`user.lastFmSessionKey !== undefined && config.lastFmSharedSecret !==
undefined ? ... : Promise.resolve(...)`, `:113-119`). Die
   Sprachmischung und die Inline-Bedingung im `Promise.all`-Array erschweren
   das schnelle Erfassen, welche Quelle optional ist.
10. **`packages/backend/src/features/queue/shell/route.ts:149-159`** —
    `_request as FastifyRequest` (siehe Typsicherheit). Der Unterstrich
    suggeriert "ungenutzt", der Cast beweist das Gegenteil zwei Zeilen
    später — ein neuer Entwickler, der dem Namenskonvention-Signal traut,
    übersieht, dass der Parameter doch gebraucht wird.

## Toter Code und Duplikate

**(A)**

- `knip` (Dead-Code-Scan über alle drei Pakete): `{"issues":[]}`
  (`.review-artifacts/check-dead.txt:1`) — **kein toter Code/Export
  gefunden.** Gut, sollte so bleiben.
- `check:arch` (depcruise): 0 Zyklen in 248 (Backend) + 231 (Frontend) + 17
  (Shared) Modulen (`.review-artifacts/check-arch.txt:2,5,8`).
- `check:dupes` (jscpd, Schwelle 0 %, `.jscpd.json:8`): **21 Klone, 291
  duplizierte Zeilen (0,97 %), 1899 Token (1,36 %)**
  (`.review-artifacts/check-dupes.txt:64-73`) — Skript schlägt fehl
  (`ELIFECYCLE ... exit code 1`, `:78`). Vollständige Liste der 21 Klone ist
  in `.review-artifacts/check-dupes.txt:1-63` dokumentiert, Kernstellen oben
  unter Verständlichkeit (#4–#7) sowie im Konzept-Abschnitt.
- **`check:dupes` ist nicht Teil von `precommit`** (`package.json:33` listet
  `test`, `lint`, `test:coverage`, `type-check`, `knip`, `depcruise` — kein
  `jscpd`/`check:dupes`). Das erklärt, warum sich 21 Klone unbemerkt
  ansammeln konnten: das einzige Tool, das sie misst, läuft nie automatisch.
- Kleinster Fund: `packages/frontend/src/App.spec.ts:26-38` ↔
  `packages/frontend/src/app/HomeView.spec.ts:8-20` (13 Zeilen Test-Setup-
  Duplikat, `.review-artifacts/check-dupes.txt:61-63`) — geringe Wirkung,
  aber einfachster Fix im ganzen Report (gemeinsame Test-Fixture).

## Was gut ist und bleiben soll

- **(A)** FCIS-Grenze ist mehrschichtig und automatisiert durchgesetzt
  (ESLint boundaries + core-spezifische Regeln + depcruise-Zyklencheck) statt
  nur dokumentiert — Verstöße fallen im Lint/CI auf, nicht erst im Review.
- **(A)** Keine einzige `eslint-disable`-Umgehung von `no-explicit-any` oder
  `no-unsafe-type-assertion` im Produktionscode.
- **(A)** Frontend-HTTP-Schicht (`packages/frontend/src/platform/api/requestResult.ts:1-50`)
  validiert jede Response konsequent gegen ein Zod-Schema, bevor der Wert das
  Typsystem verlässt — genau das Pattern, das im Backend an zwei Stellen
  (Queue, Tidal-Routes) fehlt.
- **(A)** `knip`: 0 tote Exports/Dateien über drei Pakete hinweg.
- **(A)** `.dependency-cruiser.cjs:1-14` begründet in einem Kommentar explizit,
  _warum_ nur zwei Regeln dort liegen (Redundanz zu ESLint/knip vermeiden)
  — bewusst minimal gehaltene Tool-Landschaft statt Regel-Wildwuchs.

## Backlog

| Titel                                                                                                                                          | Wirkung                                                                                         | Aufwand | Dateien                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `check:dupes` in `precommit` aufnehmen (oder Schwelle bewusst neu setzen)                                                                      | Verhindert weiteres unbemerktes Duplikat-Wachstum                                               | S       | `package.json:33`, `.jscpd.json:8`                                                                                                    |
| `fisherYatesShuffle` von `Math.random()` entkoppeln (Random-Fn injizieren)                                                                     | Core-Funktion wird wieder deterministisch testbar                                               | S       | `packages/backend/src/features/personal-radio/core/seed-merger.ts:113-129`                                                            |
| `QueueRemovalResult` auf `Result<QueueProjection \| undefined, LmsError>` aus `shared` umstellen                                               | Shared-Helfer (`isOk`/`map`/`flatMap`) werden wieder nutzbar, ein Result-Vertrag im ganzen Repo | S/M     | `packages/backend/src/features/queue/shell/queue-removal-service.ts:69-71`, Aufrufer in `route.ts`                                    |
| `isRecord`/`isBodyRecord` auf die bereits exportierte Version in `execute.ts` konsolidieren                                                    | 20 identische Implementierungen → 1                                                             | S       | `packages/backend/src/adapters/lms-client/execute.ts:20`, 19 weitere Fundstellen s. o.                                                |
| `_request as FastifyRequest` prüfen/entfernen                                                                                                  | Redundanter Cast + irreführende `_`-Namenskonvention                                            | S       | `packages/backend/src/features/queue/shell/route.ts:154,509`                                                                          |
| Queue-Endpunkte (`/add`, `/add-album`, `/add-track-list`, `/jump`, `/remove`, `/reorder`, `/clear`, `/remove-batch`) auf Zod-Schemas umstellen | Beseitigt größte verbleibende Validierungs-Inkonsistenz, reduziert `route.ts` deutlich          | M       | `packages/backend/src/features/queue/shell/route.ts` (gesamt, 579 Zeilen)                                                             |
| `handleQueueRemoval` aufteilen: Radio-Kontext erfassen / LMS-Mutation / Replenish-Trigger als benannte Schritte                                | Reduziert kognitive Last (Fund #1), macht Fire-and-Forget-Pfad sichtbar                         | M       | `packages/backend/src/features/queue/shell/queue-removal-service.ts:83-229`                                                           |
| `genre-radio`/`loved-radio` sowie `tidal-routes`/`queue/route.ts` gemeinsame Klon-Blöcke extrahieren                                           | Reduziert 21 jscpd-Klone signifikant, ein Änderungsort statt zwei                               | M       | siehe Verständlichkeit #5–#7, `.review-artifacts/check-dupes.txt`                                                                     |
| `lastfm-client/client.ts` interne Selbst-Klone extrahieren                                                                                     | Größte Backend-Datei (825 Zeilen) wird kleiner und einheitlicher                                | M       | `packages/backend/src/adapters/lastfm-client/client.ts:169,429,438,569,579,598,606,616,633,642,741,749`                               |
| `networkInterfaces()`-Cast durch Runtime-Guard ersetzen oder Typdifferenz dokumentieren                                                        | Einzige ungesicherte OS-API-Grenze im Repo                                                      | S       | `packages/backend/src/features/setup/shell/discovery.ts:32-37`, `packages/backend/src/features/setup/core/discovery-parsers.ts:34-38` |
