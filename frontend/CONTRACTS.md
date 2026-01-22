# CONTRACTS.md — Skyjo WebSocket Protocol (Examples)

Dit document bevat **echte voorbeeldberichten** (copy/paste uit je test-outputs) plus korte toelichting.
Doel: de frontend (en Codex) exact laten weten welke berichten binnenkomen en welke velden betrouwbaar zijn.

> Endpoint: `ws://127.0.0.1:8001/ws`

---

## Algemeen berichtformaat

### Client → Server
- `type`: string
- `payload`: object

### Server → Client
- `type`: string
- `payload`: object

---

## Client → Server message types

### 1) `create_table`
Doel: table-device maakt een game.

Payload:
- `{}`

Voorbeeld:
```json
{"type":"create_table","payload":{}}
```

### 2) `join_game`
Doel: player joint een bestaande game.

Payload:
- `code`: string (uppercase)
- `name`: string

Voorbeeld:
```json
{"type":"join_game","payload":{"code":"ZG35","name":"Silas"}}
```

### 2b) `resume_game`
Doel: player herbindt aan bestaande game na refresh.

Payload:
- `code`: string (uppercase)
- `token`: string

Voorbeeld:
```json
{"type":"resume_game","payload":{"code":"ZG35","token":"<token>"}}
```


### 3) `set_ready`
Doel: player zet ready/unready (alleen LOBBY).

Payload:
- `token`: string
- `ready`: boolean

Voorbeeld:
```json
{"type":"set_ready","payload":{"token":"<token>","ready":true}}
```

### 4) `setup_reveal`
Doel: in SETUP_REVEAL 2 kaarten omdraaien.

Payload:
- `token`: string
- `index`: number (0–11)

Voorbeeld:
```json
{"type":"setup_reveal","payload":{"token":"<token>","index":0}}
```

### 5) `draw_from_deck`
Doel: current player pakt kaart van deck (TURN_CHOOSE_SOURCE → TURN_RESOLVE).

Payload:
- `token`: string

Voorbeeld:
```json
{"type":"draw_from_deck","payload":{"token":"<token>"}}
```

### 6) `take_discard`
Doel: current player pakt bovenste discard (TURN_CHOOSE_SOURCE → TURN_RESOLVE).

Payload:
- `token`: string

Voorbeeld:
```json
{"type":"take_discard","payload":{"token":"<token>"}}
```

### 7) `discard_drawn`
Doel: current player discards drawn card (TURN_RESOLVE → next turn of ROUND_OVER).

Payload:
- `token`: string

Voorbeeld:
```json
{"type":"discard_drawn","payload":{"token":"<token>"}}
```

### 7b) `discard_drawn_and_reveal`
Doel: current player discards drawn card and reveals a face-down grid card.

Payload:
- `token`: string
- `index`: number (0–11)

Voorbeeld:
```json
{"type":"discard_drawn_and_reveal","payload":{"token":"<token>","index":4}}
```

### 8) `swap_into_grid`
Doel: current player plaatst drawn card in grid (TURN_RESOLVE → next turn of ROUND_OVER).

Payload:
- `token`: string
- `index`: number (0–11)

Voorbeeld:
```json
{"type":"swap_into_grid","payload":{"token":"<token>","index":2}}
```

### 9) `start_new_round`
Doel: na ROUND_OVER start een nieuwe ronde, tenzij GAME_OVER.

Payload:
- `token`: string

Voorbeeld:
```json
{"type":"start_new_round","payload":{"token":"<token>"}}
```

---

## Server → Client message types (met echte voorbeelden)

### A) `table_created`
Wordt gestuurd naar de socket die `create_table` deed.

Voorbeeld:
```json
{"type":"table_created","payload":{"code":"ZG35"}}
```

Velden:
- `payload.code`: string (join code)

---

### B) `joined`
Wordt gestuurd naar de player die `join_game` deed.

Echt voorbeeld (ws_create_and_join_test.py):
```json
{"type":"joined","payload":{"playerId":"5c6d075fca39","token":"ogiRhdFF7norx8jPnwKNpw","code":"ZG35"}}
```

Velden:
- `payload.playerId`: string
- `payload.token`: string (gebruik voor alle player acties)
- `payload.code`: string

---

### C) `player_private_state`
Wordt gestuurd naar een player-socket (alleen eigen info + private grid).

Echt voorbeeld (ws_create_and_join_test.py):
```json
{"type":"player_private_state","payload":{"me":{"playerId":"5c6d075fca39","name":"Silas","drawnCard":null,"setupRevealsDone":0,"grid":[{"i":0,"isRemoved":false,"isFaceUp":false,"value":null},{"i":1,"isRemoved":false,"isFaceUp":false,"value":null},{"i":2,"isRemoved":false,"isFaceUp":false,"value":null},{"i":3,"isRemoved":false,"isFaceUp":false,"value":null},{"i":4,"isRemoved":false,"isFaceUp":false,"value":null},{"i":5,"isRemoved":false,"isFaceUp":false,"value":null},{"i":6,"isRemoved":false,"isFaceUp":false,"value":null},{"i":7,"isRemoved":false,"isFaceUp":false,"value":null},{"i":8,"isRemoved":false,"isFaceUp":false,"value":null},{"i":9,"isRemoved":false,"isFaceUp":false,"value":null},{"i":10,"isRemoved":false,"isFaceUp":false,"value":null},{"i":11,"isRemoved":false,"isFaceUp":false,"value":null}]},"gameMeta":{"phase":"LOBBY","currentPlayerId":null,"finalRound":false,"finisherId":null,"lastTurnsRemaining":0,"roundIndex":1,"totalScores":{},"winnerId":null,"rankedTotals":null}}}
```

#### Private state schema (belangrijkste velden)

`payload.me`:
- `playerId`: string
- `name`: string
- `drawnCard`: number | null  
  - wordt **niet-null** nadat je `draw_from_deck` of `take_discard` doet
- `setupRevealsDone`: number (0–2)
- `grid`: array van 12 cellen, elk:
  - `i`: number (0–11)
  - `isRemoved`: boolean
  - `isFaceUp`: boolean
  - `value`: number | null  
    - `null` zolang `isFaceUp=false` (behalve in ROUND_OVER waar alles open kan zijn)

`payload.gameMeta`:
- `phase`: string (zelfde phases als public)
- `currentPlayerId`: string | null
- `finalRound`: boolean
- `finisherId`: string | null
- `lastTurnsRemaining`: number
- `roundIndex`: number
- `totalScores`: object map `{ [playerId]: number }`
- `winnerId`: string | null (alleen betekenisvol bij GAME_OVER)
- `rankedTotals`: array | null (alleen betekenisvol bij GAME_OVER)

---

### D) `game_public_state`
Wordt gebroadcast naar alle sockets in dezelfde game (table + players).

Echt voorbeeld (ws_create_and_join_test.py):
```json
{"type":"game_public_state","payload":{"game":{"id":"ae085b0b7c0e4c4d9ce24921bec667f1","code":"ZG35","phase":"LOBBY","deckCount":0,"discardTop":null,"currentPlayerId":null,"finalRound":false,"finisherId":null,"lastTurnsRemaining":0,"roundScores":null,"finisherDoubled":null,"roundIndex":1,"totalScores":{},"winnerId":null,"rankedTotals":null,"players":[{"id":"5c6d075fca39","name":"Silas","ready":false,"revealedCount":0,"removedCount":0}]}}}
```

#### Public state schema (belangrijkste velden)

`payload.game`:
- `id`: string
- `code`: string
- `phase`: string
- `deckCount`: number
- `discardTop`: number | null
- `currentPlayerId`: string | null
- `finalRound`: boolean
- `finisherId`: string | null
- `lastTurnsRemaining`: number
- `roundScores`: object | null  
  - alleen gevuld in `ROUND_OVER`
- `finisherDoubled`: boolean | null  
  - alleen gevuld in `ROUND_OVER`
- `roundIndex`: number
- `totalScores`: object map `{ [playerId]: number }`
- `winnerId`: string | null (alleen betekenisvol bij GAME_OVER)
- `rankedTotals`: array | null (alleen betekenisvol bij GAME_OVER)
- `players`: array van players:
  - `id`, `name`, `ready`, `revealedCount`, `removedCount`

---

### E) `game_public_state` — SETUP_REVEAL voorbeeld
Echt voorbeeld (ws_start_and_reveal_test.py, game start):
```json
{"type":"game_public_state","payload":{"game":{"id":"1fe1aa47fb074ef68fd194b1cd5a7a54","code":"C8HT","phase":"SETUP_REVEAL","deckCount":50,"discardTop":7,"currentPlayerId":"301ebf06537d","finalRound":false,"finisherId":null,"lastTurnsRemaining":0,"roundScores":null,"finisherDoubled":null,"roundIndex":1,"totalScores":{"301ebf06537d":0,"6a88e6ea0313":0},"winnerId":null,"rankedTotals":null,"players":[{"id":"301ebf06537d","name":"Silas","ready":true,"revealedCount":0,"removedCount":0},{"id":"6a88e6ea0313","name":"Player2","ready":true,"revealedCount":0,"removedCount":0}]}}}
```

---

### F) `game_public_state` — TURN_CHOOSE_SOURCE voorbeeld
Echt voorbeeld (ws_start_and_reveal_test.py, setup klaar):
```json
{"type":"game_public_state","payload":{"game":{"id":"1fe1aa47fb074ef68fd194b1cd5a7a54","code":"C8HT","phase":"TURN_CHOOSE_SOURCE","deckCount":50,"discardTop":7,"currentPlayerId":"301ebf06537d","finalRound":false,"finisherId":null,"lastTurnsRemaining":0,"roundScores":null,"finisherDoubled":null,"roundIndex":1,"totalScores":{"301ebf06537d":0,"6a88e6ea0313":0},"winnerId":null,"rankedTotals":null,"players":[{"id":"301ebf06537d","name":"Silas","ready":true,"revealedCount":2,"removedCount":0},{"id":"6a88e6ea0313","name":"Player2","ready":true,"revealedCount":2,"removedCount":0}]}}}
```

---

### G) `info`
Informatieve message (toon in UI als toast/log).

Echte voorbeelden (ws_start_and_reveal_test.py):
```json
{"type":"info","payload":{"message":"Game started. Each player reveal 2 cards."}}
```

```json
{"type":"info","payload":{"message":"Setup done. Turns can begin."}}
```

Opmerking:
- Soms zit er ook `payload.event` in (bij engine-events). Frontend kan veilig `payload.message` tonen en `payload.event` optioneel verwerken.

---

### H) Engine events in `info.payload.event`
In sommige tests worden engine events als dict geprint. In WS-berichten zitten deze typisch in:
- `type: "info"`
- `payload.event: { type: "...", ... }`

Voorbeelden uit testoutput:

Final round started:
```json
{"type":"final_round_started","finisherId":"7e5e7029cdba","lastTurnsRemaining":1}
```

Round ended:
```json
{"type":"round_ended","scores":{"b2ffb9965678":26,"335dd8fa73be":0},"finisherId":"b2ffb9965678","finisherDoubled":true}
```

Game over:
```json
{"type":"game_over","threshold":100,"winnerId":"35e220fcf7bc","rankedTotals":[{"playerId":"35e220fcf7bc","total":144},{"playerId":"45decdc36e18","total":144}],"totalScores":{"45decdc36e18":144,"35e220fcf7bc":144}}
```

Let op: de frontend moet **niet** afhankelijk zijn van deze events om correct te werken.
De “source of truth” blijft `game_public_state.phase`.

---

### I) `error`
Server-side error: toon in UI.

Schema:
```json
{"type":"error","payload":{"message":"..."}}
```

Voorbeeld (generiek):
```json
{"type":"error","payload":{"message":"Not your turn"}}
```

---

## Frontend implementatie-notes (pragmatisch)

1) **State updates**
- Bewaar altijd de laatste `game_public_state` in state (table en player UI)
- Bewaar altijd de laatste `player_private_state` in player UI

2) **Phase-driven rendering**
- Knoppen en grid-clicks alleen tonen/activeren als phase + currentPlayerId het toestaan

3) **GAME_OVER**
- Verwacht dat `game_over` event soms niet zichtbaar is (timing/consume buffer),
  maar `phase == GAME_OVER` in `game_public_state` is leidend.

4) **Nullability**
- `discardTop` kan `null` in LOBBY
- `currentPlayerId` kan `null` in LOBBY
- `roundScores` en `finisherDoubled` zijn `null` tenzij `phase == ROUND_OVER`
- `winnerId` en `rankedTotals` zijn `null` tenzij `phase == GAME_OVER`
