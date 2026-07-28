# 06 — Resilienz: LMS-Verbindungsabriss

Ziel dieses Reports: **verstehen und reproduzieren**, kein Fix. Jede Aussage
ist mit Code-Fundstelle belegt; wo geraten wird, ist das gekennzeichnet.

> **Nachtrag:** Die erste Fassung dieses Reports hat "Player" als die
> Vue-Frontend-App gelesen und nur Browser↔Backend sowie Backend↔LMS
> untersucht. Der eigentliche Auftrag ("Verbindung zwischen LMS und
> Player") meint die **physische/Software-Wiedergabeeinheit** (bei diesem
> Setup: Argon Solo über UPnPBridge, siehe Betriebs-Notizen), die per
> SlimProto/UPnP an LMS hängt — nicht den Browser. Das ist eine **dritte
> Verbindung**, siehe 1.3, mit dem größten Blast-Radius aller drei. Beide
> ursprünglich untersuchten Verbindungen sind reale, eigenständige Lücken
> und bleiben unten stehen.

## Kurzfassung

Es gibt **drei getrennte Verbindungen**, die alle unter "LMS-Verbindung"
laufen, aber unterschiedlich robust — und unterschiedlich sichtbar — sind:

1. **LMS ↔ Player** (SlimProto/UPnP, hält LMS selbst) — das ist die im
   Auftrag gemeinte Verbindung. Wenn der Player (die Hardware/das UPnP-Gerät)
   sein WLAN verliert, merkt **nur LMS** das. Unser Backend fragt LMS nie
   nach dem Connected-Status des Players — nur nach Songs, Zeit, Modus. LMS
   bleibt für unser Backend die ganze Zeit über per HTTP erreichbar (kein
   NetworkError!), liefert aber möglicherweise veraltete/merkwürdige
   Player-Daten weiter. Das deckt sich exakt mit der Beobachtung "wir
   wundern uns nur über merkwürdige Effekte" — siehe 1.3.
2. **Browser ↔ Backend** (Socket.IO) — reconnectet automatisch, aber sein
   Zustand (`connectionState`) wird **nirgends im UI konsumiert**. Fällt
   diese Verbindung weg (Client-seitiger WLAN-Aussetzer), friert die UI ein,
   ohne dass irgendein sichtbares Signal existiert.
3. **Backend ↔ LMS** (HTTP JSON-RPC Polling, 1×/s) — wird erkannt und über
   zwei parallele, leicht inkonsistente Pfade an das UI gemeldet (WS-Event
   vs. separater HTTP-Health-Poll). Für diesen Fall existiert bereits ein
   Banner mit Retry-Button. Die Erkennung ist aber langsamer als nötig,
   weil `getStatus()` intern mit Retry (bis zu 18s Blockierung) arbeitet.

Alle drei treffen den Wiedergabe-Hotpath direkt (Player-Status, Fortschritt,
Queue) — (1) am direktesten, weil dort tatsächlich kein Ton mehr läuft,
während unsere Anzeige das Gegenteil behaupten kann. Tidal läuft komplett
durch denselben LMS-Pfad (kein eigener Adapter) und erbt dessen Verhalten.
Last.fm hat einen echten Circuit Breaker und liegt außerhalb des Hotpaths.

---

## SCHRITT 1 — Den echten Fehlerfall nachstellen

### 1.1 Wie kommuniziert der Player mit dem LMS?

Drei Verbindungen, drei Mechanismen:

**(0) LMS ↔ Player: SlimProto/UPnP, außerhalb unseres Codes — die im
Auftrag gemeinte Verbindung**

Diese Verbindung wird von LMS selbst gehalten, nicht von unserem Code. Für
diesen Report relevant ist nur: **was weiß unser Backend davon, und wie
fragen wir es ab?** Antwort: kaum etwas, und wir fragen es nicht ab — Details
in 1.3.

**(A) Browser ↔ Backend: Socket.IO, dauerhaft gehalten**

`packages/frontend/src/app/useWebSocket.ts:30-72` — ein App-weites Singleton-
Socket wird beim ersten `useWebSocket()`-Aufruf erzeugt:

```ts
const socket: TypedSocket = io(getWebSocketUrl(), {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000, // Start bei 1s
  reconnectionDelayMax: 5000, // Max 5s zwischen Versuchen
  timeout: 5000,
});
```

Es gibt also **einen Reconnect mit Backoff** (1s → … → max 5s, unbegrenzte
Versuche) — Socket.IO-Bordmittel, korrekt konfiguriert. Der interne
`connectionState`-Ref (`'connecting' | 'connected' | 'disconnected' |
'reconnecting'`) wird bei `disconnect`, `reconnect_attempt`, `reconnect` und
`error` sauber aktualisiert (`useWebSocket.ts:44-69`).

**(B) Backend ↔ LMS: kein WebSocket, sondern HTTP-Polling im 1s-Takt**

`packages/backend/src/infrastructure/websocket/status-poller.ts:121-547` —
`startStatusPolling()` ruft rekursiv `lmsClient.getStatus()` per JSON-RPC
über HTTP auf (`packages/backend/src/adapters/lms-client/execute.ts:120-250`,
`baseUrl = http://${host}:${port}/jsonrpc.js`) und broadcastet das Ergebnis
per Socket.IO an alle Clients im `PLAYER_UPDATES_ROOM`. LMS selbst hat keine
push-basierte Verbindung zum Backend — die "Live-Wirkung" entsteht rein
durch 1s-Polling + WS-Broadcast an den Client.

### 1.2 Was passiert bei Abriss mitten im Betrieb?

**Fall B (Backend ↔ LMS reißt ab, z.B. LMS-Host offline):**

`makeExecuteCommand` setzt pro Request ein 5s-Timeout
(`execute.ts:191-193`, `type LmsConfig { readonly timeout: number }` = 5000,
`packages/backend/src/infrastructure/lms-registry.ts:53`). `getStatus()`
läuft über `executeCommandWithRetry` (`playback.ts:163-166`), das bei
`NetworkError`/`TimeoutError` mit Backoff **1s → 2s → 4s über 3 Versuche**
erneut versucht (`retry.ts:22-25`, `33-34`).

Rechnung fürs Worst-Case pro Poll-Zyklus während eines Ausfalls:
5s (Timeout #1) + 1s (Backoff) + 5s (Timeout #2) + 2s (Backoff) + 5s
(Timeout #3) ≈ **18 Sekunden**, bevor `poll()` überhaupt zurückkehrt und
`SYSTEM_LMS_DISCONNECTED` emittiert (`status-poller.ts:195-224`). Der
nächste Poll wird erst danach über `scheduleNextPoll()` angestoßen
(`status-poller.ts:141-163`) — die Schleife blockiert also für die Dauer
des Retry-Ketten, nicht nur 1s. **Das gilt für jeden weiteren Poll, solange
LMS down bleibt** — die effektive Polling-Frequenz sinkt während eines
Ausfalls von 1/s auf ~1/18s, was auch die Recovery-Erkennung verzögert.

Sobald das Ergebnis da ist, wird korrekt gemeldet:

```ts
// status-poller.ts:195-224
if (!statusResult.ok || !statusResult.value) {
  if (!lmsWasDisconnected) {
    io.to(PLAYER_UPDATES_ROOM).emit(SYSTEM_LMS_DISCONNECTED, systemEventResult.value)
  }
  ...
}
```

Frontend-seitig hört `usePlaybackStore.ts:297-304` genau darauf:

```ts
on("system.lmsDisconnected", (_payload) => {
  lmsError.value = "Cannot connect to music server";
});
on("system.lmsReconnected", (_payload) => {
  lmsError.value = null;
  syncPlaybackState();
});
```

`isLmsDisconnected` (`usePlaybackStore.ts:82`) treibt einen Banner mit
Retry-Button in `NowPlayingPanel.vue:390-409` (`data-testid="lms-error-banner"`,
Button ruft `playbackStore.retryLmsConnection()` → `GET /health`, siehe
`usePlaybackStore.ts:568-584`).

**Parallel dazu** existiert ein zweiter, unabhängiger Erkennungspfad:
`useLmsHealth.ts` pollt `GET /health` per HTTP (nicht WS) alle 30s (gesund),
15s (down) bzw. 4s (erste Fehlversuche), siehe `useLmsHealth.ts:5-15`. Der
Health-Handler probet mit **einfachem** `executeCommand` ohne Retry
(`getCurrentTime()`, `playback.ts:360-362`) — ein einzelner 5s-Timeout, kein
18s-Ketten-Delay. `shouldShowLmsDownBanner` verlangt 2 aufeinanderfolgende
Fehlversuche (`domains/lms/core/service.ts:6-14`), zeigt dann
`LmsDownBanner.vue` (rein informativ, kein Retry-Button,
`i18n/index.ts:238`: _"LMS server unreachable — trying to wake it…"_).

→ **Zwei Banner, zwei Trigger-Pfade, zwei unterschiedliche
Reaktionszeiten** (WS-Pfad: bis zu ~18s pro Zyklus; HTTP-Health-Pfad: ~9-14s
bis zum Banner) für denselben Nutzer-sichtbaren Zustand. Nicht offensichtlich
falsch, aber redundant und inkonsistent getimt — vermutlich historisch
gewachsen (S02-Kommentar bei `NowPlayingPanel.vue:390` deutet auf
unterschiedliche Stories hin).

**Fall A (Browser ↔ Backend reißt ab, z.B. Client-WLAN-Aussetzer) — das im
Auftrag beschriebene Szenario:**

Das ist der Fall, den `SYSTEM_LMS_DISCONNECTED` **nicht** abdeckt, weil das
Backend ↔ LMS in diesem Szenario völlig unberührt bleibt — nur die Strecke
Browser ↔ Backend ist weg. Socket.IO merkt es (`disconnect`-Event,
`useWebSocket.ts:48-50`) und reconnectet automatisch mit Backoff. **Aber:**

```bash
$ grep -rn "connectionState" packages/frontend/src --include="*.vue"
# kein Treffer
$ grep -rln "connectionState" packages/frontend/src
useWebSocket.test.ts
useWebSocket.ts
```

`connectionState` wird von `useWebSocket()` zurückgegeben, aber **kein
einziger Consumer liest es**. `usePlaybackStore.ts:272` und
`useQueueStore.ts:352` destrukturieren beide nur `{ on, subscribe,
onReconnect }` — nie `connectionState`. Kein Vue-Component importiert es.
Das Feld existiert, hat eigene Tests (`useWebSocket.test.ts:140-193`), wird
korrekt gepflegt — und erreicht nie das UI.

**Konsequenz:** Während der Client offline ist, laufen keine
`player.statusChanged`/`player.queue.updated`-Events mehr ein. Die Store-
Werte (`isPlaying`, `currentTrack`, `currentTime`, `queuePreview`) bleiben
exakt auf dem letzten empfangenen Snapshot stehen — es gibt keinen Timeout,
der sie invalidiert. `hasError` und `isLmsDisconnected` bleiben `false`,
weil beide ausschließlich über explizite WS-Events bzw. HTTP-Fehler gesetzt
werden (`usePlaybackStore.ts:81-82`), nicht über den Transport-Zustand.
**Der Nutzer sieht eine eingefrorene, aber optisch völlig gesunde
Now-Playing-Anzeige** — kein Banner, kein Fehlertext, kein Hinweis, dass
gerade nichts mehr synchronisiert wird.

### 1.3 Fall C (der eigentliche Auftrag): LMS ↔ Player reißt ab

Wenn der Player selbst sein WLAN verliert, bleibt **Backend ↔ LMS** (Fall B)
komplett unberührt — LMS läuft weiter, der HTTP-Server antwortet weiter
normal. Unser Backend bekommt also **keinen** `NetworkError`/`TimeoutError`
und emittiert folglich auch kein `SYSTEM_LMS_DISCONNECTED`. Der gesamte in
1.2/Fall B beschriebene Erkennungsmechanismus (Retry-Timing, Health-Poll,
Banner) greift hier **nicht**, weil er ausschließlich "ist der LMS-HTTP-
Server erreichbar" prüft — nie "ist der konfigurierte Player noch mit LMS
verbunden".

**Belegt: LMS kennt und exponiert den Connected-Status pro Player — wir
fragen ihn nur nie zur Laufzeit ab.**

LMS' `players`-JSON-RPC-Kommando liefert pro Player ein `connected`-Feld,
und unser eigener Code parst es bereits — aber nur für den
Setup-Assistenten, nicht im laufenden Betrieb:

```ts
// packages/backend/src/features/setup/core/discovery-parsers.ts:86-92
return {
  playerid,
  name,
  model: typeof value["model"] === "string" ? value["model"] : undefined,
  connected:
    typeof value["connected"] === "number" ? value["connected"] : undefined,
};
```

```ts
// packages/backend/src/features/setup/shell/discovery.ts:156-167
export const fetchLmsPlayers = async (host: string, port: number) =>
  fetch(`http://${host}:${port}/jsonrpc.js`, {
    method: "POST",
    body: JSON.stringify({
      method: "slim.request",
      params: ["", ["players", 0, 100]],
      id: 1,
    }),
    ...
```

`fetchLmsPlayers` wird ausschließlich im Setup-Wizard aufgerufen (Discovery
beim Erst-Einrichten), nicht vom 1s-Status-Poller.

Der laufende Poller fragt stattdessen nur den spielerspezifischen
`status`-Befehl ab — mit Tags, die **keinen** Connected-/Power-Hinweis
in der Anfrage nennen (siehe Live-Verifikation weiter unten: das Feld kommt
trotzdem mit zurück, wird von uns aber verworfen):

```ts
// packages/backend/src/adapters/lms-client/playback.ts:159-166
const command: LmsCommand = ["status", "-", 4, "tags:u,a,l,S,e,K"];
const result = await executeCommandWithRetry(command, statusPayloadParser);
```

```ts
// packages/backend/src/adapters/lms-client/playback.ts:56-64
const statusPayloadParser = createLmsResultParser(
  z.object({
    mode: z.string(),
    time: z.union([z.number(), z.string()]).optional(),
    duration: z.union([z.number(), z.string()]).optional(),
    "mixer volume": z.union([z.number(), z.string()]).optional(),
    playlist_loop: z.array(statusTrackSchema).optional(),
  }),
);
```

Und der `PlayerStatus`-Typ, den der Rest des Systems (Poller, WS-Payload,
Frontend-Store) verwendet, hat schlicht kein Feld dafür:

```ts
// packages/backend/src/adapters/lms-client/types.ts:229-236
export type PlayerStatus = {
  readonly mode: "play" | "pause" | "stop";
  readonly time: number;
  readonly duration: number;
  readonly volume: number;
  readonly currentTrack: SearchResult | null;
  readonly queuePreview: readonly QueuePreviewItem[];
};
```

**Konsequenz (verifiziert über Code):** Solange LMS selbst per HTTP
erreichbar bleibt, gibt `getStatus()` `ok: true` zurück — unabhängig davon,
ob der Player noch verbunden ist. Es gibt keinen Code-Pfad, der das
unterscheidet. Der Poller würde also weiter `mode`/`time` für einen
physisch stummen Player broadcasten, ohne jeden Hinweis, dass diese Werte
nicht mehr aktuell sind.

**Was LMS bei einem Player-Disconnect tatsächlich tut — zunächst anhand der
offiziellen Lyrion-CLI-Referenz, dann live gegen `lms.fritz.box` überprüft
(VPN-Zugriff bestand während dieses Reports zeitweise; Quellen/Rohdaten am
Ende des Reports):**

1. `player_connected` ist ein offiziell dokumentiertes Status-Tag: "1 or 0
   depending on the state of the TCP connection to the player". Das
   compound `status`-Query listet es unter seinen Tags; `player_ip` wird
   dort separat als "only if connected" markiert.
2. Direkt beim Abriss feuert serverseitig eine `client disconnect`-
   Notification. LMS **löscht den Player nicht sofort**: "unless it
   reconnects (as signaled by `client reconnect`) before a number of
   minutes, the client will be automatically forgotten by the server." Die
   exakte Minutenzahl ist in der Doku nicht beziffert und war mit dem
   verfügbaren Zeitfenster nicht risikofrei am echten "Living Room speaker"
   (Argon Solo, UPnPBridge) zu testen, ohne dessen laufende Konfiguration zu
   riskieren — siehe "Offen" unten.
3. **Nach der "vergessen"-Schwelle** liefert `status` für eine unbekannte
   Player-ID keinen JSON-Envelope, sondern gar keine HTTP-Antwort. Das ist
   nicht mehr Doku-Ableitung, sondern live verifiziert:

   ```
   $ curl -X POST http://lms.fritz.box:9000/jsonrpc.js \
       -d '{"method":"slim.request","params":["00:00:00:00:00:00",
            ["status","-",1,"tags:u,a,l,S,e,K"]],"id":1}'
   curl: (52) Empty reply from server
   ```

   Deckt sich mit einem bekannten, öffentlich gemeldeten Verhalten
   ([slimserver#1526](https://github.com/LMS-Community/slimserver/issues/1526):
   "JSONRPC returns empty reply … while players are connected"). Für unseren
   Code bedeutet das **nicht** den zuvor angenommenen `JsonParseError`,
   sondern: `fetch()` wirft bei einer leeren/abgebrochenen Antwort, landet
   im `.catch()` von `makeExecuteCommand` (`execute.ts:216-219`), und
   `mapFetchError` klassifiziert das (kein `AbortError`, also kein Timeout)
   als **`NetworkError`** (`execute.ts:123-136`) — exakt derselbe Fehlertyp
   wie ein echter LMS-Totalausfall. `NetworkError` **ist** retry-fähig
   (`retry.ts:27-28`), durchläuft also die volle bis zu 18s-Kette aus 1.2,
   bevor `status-poller.ts` `SYSTEM_LMS_DISCONNECTED` emittiert — der
   Banner erscheint danach zwar, aber mit demselben irreführenden Text
   ("Cannot connect to music server") und derselben unnötigen Verzögerung
   wie bei einem echten LMS-Ausfall.

**Live-Verifikation, die Fix 0 direkt vereinfacht:** Der aktuelle
Poller-Query (exakt der Code aus `playback.ts:159-166`, live gegen
`lms.fritz.box` mit der echten Player-ID `bb:bb:c4:1e:ea:48` ausgeführt)
liefert **bereits jetzt** `player_connected` und `power` im Ergebnis
zurück — **obwohl keins von beidem im `tags`-Parameter angefordert wird**:

```
$ curl -X POST http://lms.fritz.box:9000/jsonrpc.js \
    -d '{"method":"slim.request","params":["bb:bb:c4:1e:ea:48",
         ["status","-",4,"tags:u,a,l,S,e,K"]],"id":1}'
{
  "result": {
    "player_connected": 1,
    "power": 1,
    "mode": "pause",
    "time": 74.83...,
    ...
  }
}
```

`tags:` steuert offenbar nur die Felder pro Track in `playlist_loop`, nicht
die Top-Level-Player-Felder — `player_connected`/`power`/`signalstrength`/
`player_ip` kommen unabhängig davon immer mit. Unser `statusPayloadParser`
(`playback.ts:56-64`) verwirft sie nur stillschweigend, weil Zod
undeklarierte Objekt-Keys standardmäßig ignoriert (kein `.strict()`). **Fix
0 braucht damit keine Änderung am `tags`-String** — die ursprüngliche
Diff-Skizze war unnötig komplex. Es reicht, `player_connected` (und
optional `power`) im bestehenden Zod-Schema zu deklarieren; das Feld ist
bereits in jeder Antwort enthalten. Die Fix-0-Sektion unten ist entsprechend
korrigiert.

**Offen geblieben (bewusst nicht getestet):** Der eine Zustand, der eine
echte Unterbrechung des laufenden "Living Room speaker" erfordert hätte —
`player_connected:0` unmittelbar nach einem echten Abriss, aber noch vor
dem Vergessen-werden — wurde **nicht** provoziert. Das hätte den
LMS-eigenen `disconnect`-CLI-Befehl oder ein reales Trennen des Geräts
gebraucht, mit dem Risiko, dass das UPnPBridge-Gerät (laut Recherche in
1.3 grundsätzlich nicht zuverlässig selbständig rekonnektierend) manuell
wieder verbunden werden muss. Das war mir ohne ausdrückliche Freigabe zu
riskant für ein reines Recherche-Review. Für Fix 0 ist das nicht
blockierend: Das Datenfeld existiert nachweislich und wird nachweislich
aktuell verworfen — der Fix ist unabhängig vom genauen Zeitverhalten des
Zwischenzustands korrekt.

Kein bestehender Test im Repo deckt dieses Szenario ab (`grep -rli
"upnp\|slimproto\|player.*disconnect" packages/backend/src` liefert außer
diesem Report keinen Treffer).

### 1.4 Reproduktion (Test statt nur Beschreibung)

Neue Testdatei (delegiert an `@shell-dev`, da `shell/`-Zone):
`packages/frontend/src/domains/playback/shell/usePlaybackStore.resilience.test.ts`

Simuliert exakt das oben beschriebene Verhalten von `useWebSocket()`
(`connectionState`-Ref wird wie im echten Composable von `'connected'` auf
`'disconnected'`/`'reconnecting'` gesetzt) und beweist:

- **Repro-Test** _"a Socket.IO transport drop leaves store state and error
  flags completely unchanged"_: Nach `player.statusChanged` (isPlaying=true,
  Track "Money") und anschließendem Transport-Abriss (`connectionState.value
= 'disconnected'` → `'reconnecting'`) bleiben `isPlaying`, `currentTrack`,
  `hasError`, `isLmsDisconnected` **identisch** zum Zustand davor.
- **Kontrollfall** _"a real LMS outage (system.lmsDisconnected) DOES set
  lmsError…"_: Derselbe Aufbau, aber mit echtem `system.lmsDisconnected`-
  Event zeigt, dass **dieser** Pfad korrekt funktioniert — der Unterschied
  liegt gezielt am Transport-vs-LMS-Fall, nicht an einem generellen Bug in
  der Store-Logik.

Testlauf (`cd packages/frontend && pnpm test -- run usePlaybackStore.resilience.test.ts`):
beide Tests grün (`Test Files 90 passed (90)`, `Tests 1321 passed (1321)`
gesamt). `pnpm type-check` und `pnpm lint` bestätigt sauber.

Zusätzlich bestätigt: `status-poller.test.ts` deckt aktuell nur
`reconcileSuppressedQueueEnd` ab (`status-poller.test.ts:20-129`) — die
komplette `SYSTEM_LMS_DISCONNECTED`/`RECONNECTED`-Emission im selben File
hat **keinen** Test. Ein `TODO(test)`-Kommentar im Code bestätigt die
generelle Testlücke dieses Moduls (`status-poller.ts:349`: _"this warning
branch has no unit test (no status-poller.test.ts yet)"_ — mittlerweile
zwar existent, aber nicht für diesen Pfad).

---

## SCHRITT 2 — Der Ratlos-Zustand, konkret benannt

| #   | Lücke                                                                                                                                                                                                                                                                                                                                                                                                                     | Fundstelle                                                                                                                                                                                                                                                                                      | Trifft Hotpath?                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 0   | Kein Feld/Check für Player-Connected-Status im laufenden Betrieb — `getStatus()` fragt nur `mode`/`time`/`playlist_loop` ab, nie das `connected`-Flag, das LMS pro Player über `players` bereits liefert. Ein Player-seitiger WLAN-Verlust ist über den gesamten Hotpath (Poller → WS → Store → UI) **unsichtbar**, solange LMS-HTTP selbst erreichbar bleibt                                                             | `playback.ts:56-64` (`statusPayloadParser` ohne Connected-Feld), `playback.ts:159-166` (`status`-Command ohne entsprechenden Tag), `types.ts:229-236` (`PlayerStatus` ohne Feld); Gegenbeweis, dass LMS es liefert: `discovery-parsers.ts:86-92`, nur im Setup genutzt (`discovery.ts:156-167`) | **Ja — der im Auftrag beschriebene Fall** |
| 1   | `connectionState` (Browser↔Backend-Transport) wird berechnet, aber von keiner Komponente/keinem Store gelesen — kein visuelles Signal bei reinem Client-WLAN-Aussetzer                                                                                                                                                                                                                                                    | `useWebSocket.ts:26,71,93` erzeugt/exportiert; `usePlaybackStore.ts:272`, `useQueueStore.ts:352` lesen es nicht; kein `.vue`-Treffer für `connectionState`                                                                                                                                      | Ja                                        |
| 2   | Kein Reconnect-Countdown/Indikator während `reconnecting` — Nutzer kann nicht unterscheiden zwischen "lädt kurz" und "hängt seit 3 Minuten"                                                                                                                                                                                                                                                                               | Folge aus Lücke 1                                                                                                                                                                                                                                                                               | Ja                                        |
| 3   | Bei Transport-Abriss ohne LMS-Ausfall: keine automatische Erholung der _sichtbaren_ Anzeige über das, was der reine Socket.IO-Reconnect + `onReconnect(syncPlaybackState)` (`usePlaybackStore.ts:278`) leistet — die Resync passiert im Hintergrund korrekt, aber der Nutzer hatte in der Zwischenzeit keine Ahnung, dass überhaupt etwas fehlte, und bekommt auch keine Bestätigung, dass jetzt wieder alles aktuell ist | `usePlaybackStore.ts:272-278`                                                                                                                                                                                                                                                                   | Ja                                        |
| 4   | Zwei redundante "LMS down"-Meldewege mit unterschiedlicher Latenz (WS-Pfad ~18s worst case wegen Retry-Kette, HTTP-Health-Pfad ~9-14s) für denselben Zustand — schwer vorherzusagen, welcher Banner zuerst erscheint bzw. ob beide gleichzeitig sichtbar werden                                                                                                                                                           | `status-poller.ts:163-166` (Retry) vs. `useLmsHealth.ts:5-15` + `health/shell/route.ts:24` (kein Retry)                                                                                                                                                                                         | Ja                                        |
| 5   | `getStatus()`-Polling blockiert bis zu 18s pro Zyklus während eines Ausfalls (statt schnell zu scheitern und alle 1s neu zu pollen) — verzögert sowohl Down- als auch Recovery-Erkennung über den WS-Pfad unnötig                                                                                                                                                                                                         | `status-poller.ts:170-225` nutzt `executeCommandWithRetry` (`playback.ts:163-166`)                                                                                                                                                                                                              | Ja                                        |
| 6   | Keine Testabdeckung für die `SYSTEM_LMS_DISCONNECTED`/`RECONNECTED`-Emission selbst                                                                                                                                                                                                                                                                                                                                       | `status-poller.test.ts` (nur `reconcileSuppressedQueueEnd`-Tests)                                                                                                                                                                                                                               | Indirekt (Regressionsschutz fehlt)        |

---

## SCHRITT 3 — Weitere Abriss-Stellen (kurz)

- **Tidal**: Kein eigener Tidal-HTTP-Adapter im Backend — Tidal-Streams
  laufen vollständig über das LMS-Tidal-Plugin, also über denselben
  `jsonrpc.js`-Pfad wie alles andere (`grep` nach `adapters/tidal*client*`
  liefert keinen Treffer; `TIDAL_ENRICH_TIMEOUT_MS`/`tidalWithTimeout`
  existieren nur in `lms-client/helpers.ts` und `lms-client/search.ts` —
  das ist ein 200ms-Cap für Metadaten-_Anreicherung_, nicht für Tidal-
  Wiedergabe selbst). Tidal-Konnektivität ist damit **keine separate
  Fehlerklasse**, sondern erbt exakt das oben beschriebene LMS-Verhalten.
- **Last.fm**: Hat einen echten Circuit Breaker
  (`adapters/lastfm-client/circuit-breaker-client.ts:22-136`, CLOSED →
  OPEN nach `failureThreshold` → HALF_OPEN nach `resetTimeoutMs`). Wird für
  Scrobbling, Empfehlungen und Metadaten-Anreicherung verwendet — alles
  Fire-and-forget bzw. asynchrone Anreicherung außerhalb des
  Wiedergabe-Hotpaths. Ein Last.fm-Ausfall blockiert keine Play/Pause/
  Skip-Aktion. **Unkritisch**, keine weitere Analyse nötig.

---

## Priorisierte Fixes

Sortiert nach erlebtem Unterschied für den Nutzer, nicht nach
Implementierungsaufwand.

### Fix 0 (größter Hebel, deckt den eigentlichen Auftrag ab): Player-Connected-Status in den Poll-Zyklus aufnehmen

Behebt Lücke 0. **Live gegen `lms.fritz.box` korrigiert (siehe 1.3):** LMS
liefert `player_connected` (und `power`) bereits jetzt in jeder
`status`-Antwort mit — unabhängig vom `tags`-Parameter. Der Fix braucht
also **keine** Änderung am Command-String, nur eine Erweiterung des
bestehenden Zod-Schemas, das dieses Feld aktuell stillschweigend verwirft:

```diff
--- a/packages/backend/src/adapters/lms-client/types.ts
+++ b/packages/backend/src/adapters/lms-client/types.ts
@@ -229,6 +229,7 @@
 export type PlayerStatus = {
   readonly mode: "play" | "pause" | "stop";
+  readonly playerConnected: boolean;
   readonly time: number; // seconds
   readonly duration: number; // seconds
   readonly volume: number; // 0-100
```

```diff
--- a/packages/backend/src/adapters/lms-client/playback.ts
+++ b/packages/backend/src/adapters/lms-client/playback.ts
@@ -56,6 +56,8 @@
 const statusPayloadParser = createLmsResultParser(
   z.object({
     mode: z.string(),
+    // Present in every status response regardless of the `tags` param —
+    // verified live against lms.fritz.box, see docs/review/06-resilience-lms.md 1.3.
+    player_connected: z.union([z.number(), z.string()]).optional(),
     time: z.union([z.number(), z.string()]).optional(),
     duration: z.union([z.number(), z.string()]).optional(),
     "mixer volume": z.union([z.number(), z.string()]).optional(),
@@ -159,7 +161,7 @@
     getStatus: async (): Promise<Result<PlayerStatus, LmsError>> => {
       const command: LmsCommand = ["status", "-", 4, "tags:u,a,l,S,e,K"];
       const result = await executeCommandWithRetry(command, statusPayloadParser);
+      // playerConnected defaults to true if the field is ever absent
+      // (older LMS versions?) — fail open rather than spuriously alarming.
+      const playerConnected = result.ok
+        ? Number(result.value.player_connected ?? 1) !== 0
+        : true;
```

(`status-poller.ts`'s `LmsPlayerStatus`, `hasStatusChanged`/
`createPlayerStatusPayload` und der `PlayerStatusPayload`-Typ im Frontend
müssten das neue Feld ebenfalls durchreichen — hier bewusst nur die
Kernstelle skizziert, nicht der komplette Durchstich.)

**Maschinelle Absicherung:** Ein `client.acceptance.test.ts`-Fall mit einem
LMS-Mock, dessen Response `player_connected: 0` bei sonst unverändertem
`mode: "play"` enthält (das ist jetzt keine hypothetische Mock-Form mehr,
sondern exakt die live gegen `lms.fritz.box` beobachtete Struktur, siehe
1.3), prüft, dass `getStatus()` das im `PlayerStatus` widerspiegelt. Darauf
aufbauend ein `status-poller.test.ts`-Fall, der genau dieses Szenario
pollt und assert, dass ein neues Event (z.B. `system.playerDisconnected`,
analog zu `SYSTEM_LMS_DISCONNECTED`) emittiert wird, statt
`player.statusChanged` mit stillschweigend veralteten Daten. Zusätzlich ein
Fall für das ebenfalls live verifizierte "vergessener Player"-Verhalten
(leere HTTP-Antwort → `NetworkError` → volle Retry-Kette, siehe 1.3): dass
dieser Pfad **schneller** als 18s zum Banner führt, ist bereits Gegenstand
von Fix 2 und muss hier nicht dupliziert werden.

Einzig offen: das exakte Verhalten _zwischen_ Abriss und Vergessen-werden
(vermutlich `player_connected:0` bei noch erfolgreicher Antwort, siehe
1.3 "Offen geblieben") — dafür bräuchte es einen bewusst provozierten
Live-Disconnect des echten Players, den ich ohne ausdrückliche Freigabe
nicht ausgelöst habe. Der Fix selbst ist davon unabhängig korrekt.

### Fix 1: `connectionState` sichtbar machen

Behebt Lücke 1-3 — die Browser↔Backend-Transportlücke. Ein
Banner/Indikator, der bei `connectionState !== 'connected'` erscheint,
analog zum bereits vorhandenen `lms-error-banner`-Muster.

```diff
--- a/packages/frontend/src/domains/playback/shell/usePlaybackStore.ts
+++ b/packages/frontend/src/domains/playback/shell/usePlaybackStore.ts
@@ -269,7 +269,7 @@
   // ── WebSocket Integration (Imperative Shell) ──────────────
-  const { on, subscribe, onReconnect } = useWebSocket() // singleton socket — lives for app lifetime
+  const { on, subscribe, onReconnect, connectionState } = useWebSocket() // singleton socket — lives for app lifetime
```

und im `return { ... }`-Block von `usePlaybackStore.ts:601+` `connectionState`
mit exportieren, damit `NowPlayingPanel.vue` einen dritten Banner-Zustand
(`v-if="playbackStore.connectionState !== 'connected'"`, Text je nach
`'disconnected'`/`'reconnecting'`) rendern kann.

**Maschinelle Absicherung:** Der bereits geschriebene Repro-Test in
`usePlaybackStore.resilience.test.ts` (siehe Schritt 1.4) wird nach diesem
Fix zum **Regressionstest**, wenn man ihn umdreht: statt "Flags bleiben
unverändert" wird die Assertion "ein neu exportierter
`connectionState`/abgeleitetes `isTransportDisconnected`-Flag wechselt auf
`true`, sobald `connectionState.value = 'disconnected'` gesetzt wird" — der
Test schlägt fehl, solange der Store das Feld nicht durchreicht, und besteht
erst nach dem Fix.

### Fix 2: Poll-Blockierung während Ausfall von ~18s auf ~5s senken

Behebt Lücke 5 (und mildert Lücke 4). `getStatus()` im Poller sollte ohne
Retry laufen (Retry ist für Einzel-Requests wie `play`/`pause` sinnvoll,
nicht für einen 1s-Polling-Loop, der selbst schon Wiederholung _ist_).

```diff
--- a/packages/backend/src/infrastructure/websocket/status-poller.ts
+++ b/packages/backend/src/infrastructure/websocket/status-poller.ts
@@
 type LmsClient = {
-  readonly getStatus: () => Promise<{ ... }>;
+  // Deliberately the non-retrying variant: the 1s poll loop is itself the
+  // retry mechanism. executeCommandWithRetry's up-to-18s backoff chain
+  // would stall detection of both disconnect and reconnect.
+  readonly getStatus: () => Promise<{ ... }>;
```

(Faktische Änderung liegt in `playback.ts`, wo `getStatus` aktuell an
`executeCommandWithRetry` statt `executeCommand` gebunden ist — die
`LmsClient`-Typannotation in `status-poller.ts` bliebe unverändert, nur die
Bindung in `playback.ts:159-166` wechselt auf `executeCommand`.)

**Maschinelle Absicherung:** Test in `status-poller.test.ts`, der einen
`lmsClient`-Mock injiziert, dessen `getStatus()` künstlich 5s statt 18s
braucht (per `vi.useFakeTimers()` + kontrollierten Promise-Delays), und
prüft, dass `SYSTEM_LMS_DISCONNECTED` nach dem ersten fehlgeschlagenen Poll
emittiert wird — nicht erst nach der vollen Retry-Kette. Deckt gleichzeitig
Lücke 6 ab (bisher komplett ungetesteter Emissionspfad).

### Fix 3: Die zwei parallelen "LMS down"-Meldewege konsolidieren

Behebt Lücke 4. Entweder der WS-Pfad (`system.lmsDisconnected` →
`lmsError`) oder der HTTP-Health-Pfad (`useLmsHealth` → `isLmsDown`) sollte
die alleinige Quelle der Wahrheit sein; der jeweils andere kann darauf
reagieren statt unabhängig zu pollen. Konkret: `useLmsHealth.ts` auf die
gleichen `system.lmsDisconnected`/`Reconnected`-Events umstellen, die
`usePlaybackStore` bereits empfängt, statt eines zweiten,
unabhängig getakteten `GET /health`-Pollers — das entfernt eine ganze
Timing-Quelle (die verschachtelten 30s/15s/4s-Intervalle) und garantiert,
dass beide Banner synchron erscheinen/verschwinden.

**Maschinelle Absicherung:** Ein Test, der `system.lmsDisconnected` feuert
und assert, dass sowohl `playbackStore.isLmsDisconnected` als auch (nach
der Umstellung) `isLmsDown` aus `useLmsHealth`/App-State im selben Tick
`true` werden — heute würden zwei unabhängige Test-Suiten grün sein, ohne
dass je geprüft wird, dass beide Signale _gemeinsam_ konsistent sind.

---

## Quellen (LMS-CLI-Verhalten, Abschnitt 1.3)

Nicht im Repo dokumentiert — recherchiert in der offiziellen Lyrion Music
Server (Nachfolgeprojekt von Logitech Media Server) CLI-Referenz, da zum
Zeitpunkt dieses Reports kein Zugriff auf `lms.fritz.box` bestand:

- [CLI - Players commands](https://lyrion.org/reference/cli/players/) —
  `player_connected`-Tag, Wertebereich (1/0 nach TCP-Verbindungsstatus)
- [CLI - Compound Queries commands](https://lyrion.org/reference/cli/compoundqueries/) —
  `status`-Query-Tags, `player_ip` "only if connected", Verhalten bei
  gelöschtem/unbekanntem Player (`error: invalid player` im
  Subscription-Modus vs. leeres Echo im Single-Request-Modus)
- [CLI - Notifications](https://lyrion.org/reference/cli/notifications/) —
  `client disconnect`/`client reconnect`, Grace-Period vor dem
  automatischen Vergessen eines Players ("a number of minutes", exakter
  Wert nicht dokumentiert)
