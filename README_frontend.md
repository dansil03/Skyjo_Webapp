# Skyjo Web Frontend (Table + Player Devices)

Dit project is de frontend voor een Skyjo-achtige webapp met:

- **Table device**: stapel + open kaart + game status (ligt “in het midden”)
- **Player device**: eigen kaarten + acties

De backend communiceert via **WebSocket**.

---

## Backend

### WebSocket endpoint
ws://127.0.0.1:8001/ws

Tip: draai de backend zonder `--reload` tijdens frontendontwikkeling om onverwachte WebSocket disconnects te voorkomen.

---

## Modes / Routes

De frontend ondersteunt twee “modes”:

- **Table view**: `/?mode=table`
- **Player view**: `/?mode=player`

Optioneel: als `mode` ontbreekt, toon een eenvoudig keuzescherm (Table / Player).

---

## Client storage

### Player device (localStorage)
- token
- playerId
- code
- name

### Table device (localStorage)
- code

---

## Message protocol (Contracts)

Alle client → server berichten:

- type: string
- payload: object

Alle server → client berichten volgen hetzelfde formaat.

---

## Client → Server messages

### create_table
Type: create_table  
Payload: {}

### join_game
Payload:
- code
- name

### set_ready
Payload:
- token
- ready

### setup_reveal
Payload:
- token
- index

### draw_from_deck
Payload:
- token

### take_discard
Payload:
- token

### discard_drawn
Payload:
- token

### swap_into_grid
Payload:
- token
- index

### start_new_round
Payload:
- token

---

## Server → Client messages

### table_created
Payload:
- code

### joined
Payload:
- playerId
- token
- code

### game_public_state
Bevat:
- phase
- deckCount
- discardTop
- currentPlayerId
- players
- roundScores (ROUND_OVER)
- totalScores, winnerId, rankedTotals (GAME_OVER)

### player_private_state
Bevat:
- me.grid
- me.drawnCard
- gameMeta.phase
- gameMeta.currentPlayerId

### info
Informatieve events (round_ended, final_round_started, game_over)

### error
Payload:
- message

---

## UI per phase

### LOBBY
Players joinen en zetten ready.

### SETUP_REVEAL
Iedere speler draait 2 kaarten om.

### TURN_CHOOSE_SOURCE
Current player kiest deck of discard.

### TURN_RESOLVE
Current player plaatst of discard de getrokken kaart.

### ROUND_OVER
Toon round scores en start nieuwe ronde.

### GAME_OVER
Toon winnaar en eindscore.
