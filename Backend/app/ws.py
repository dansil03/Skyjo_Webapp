from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .game.store import GameStore
from .game.events import ClientMessage

print("ws.py loaded")

router = APIRouter()
store = GameStore()

# Toggle debug printing for set-detection
DEBUG_SETS = False


# -------------------------
# DEBUG helpers
# -------------------------
def find_sets(obj: Any, path: str = "root") -> None:
    """
    Recursively prints the path of any `set` found inside obj.
    """
    if isinstance(obj, set):
        print(f"❌ FOUND SET at {path}: {obj}")
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            find_sets(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            find_sets(v, f"{path}[{i}]")
    elif isinstance(obj, tuple):
        for i, v in enumerate(obj):
            find_sets(v, f"{path}({i})")


# -------------------------
# Helpers
# -------------------------
async def _send(ws: WebSocket, type_: str, payload: Dict[str, Any]) -> None:
    # 🔍 DEBUG: check for sets before sending
    if DEBUG_SETS:
        print(f"\n--- DEBUG _send(type={type_}) ---")
        find_sets(payload)
    await ws.send_json({"type": type_, "payload": payload})


async def _broadcast(code: str, type_: str, payload: Dict[str, Any]) -> None:
    """
    Broadcast safely: do NOT unregister sockets on arbitrary exceptions.
    Only unregister on disconnect-like failures.
    """
    dead = []
    for s in list(store.sockets(code)):
        try:
            await _send(s, type_, payload)
        except WebSocketDisconnect:
            dead.append(s)
        except RuntimeError:
            dead.append(s)
        except Exception as e:
            print("broadcast error (ignored):", repr(e))
    for s in dead:
        store.unregister_socket(code, s)


async def _send_private(code: str, engine, player_id: str) -> None:
    dead = []
    for s in list(store.sockets(code)):
        try:
            if getattr(s.state, "player_id", None) == player_id:
                state = engine.private_state(player_id)
                if DEBUG_SETS:
                    print(f"\n--- DEBUG private_state for player {player_id} ---")
                    find_sets(state)
                await _send(s, "player_private_state", state)
        except WebSocketDisconnect:
            dead.append(s)
        except RuntimeError:
            dead.append(s)
        except Exception as e:
            print("send_private error (ignored):", repr(e))
    for s in dead:
        store.unregister_socket(code, s)


async def _send_private_all(code: str, engine) -> None:
    for pl in engine.game.players:
        await _send_private(code, engine, pl.id)


async def _broadcast_engine_events(code: str, engine) -> None:
    for ev in engine.consume_events():
        et = ev.get("type")

        if et == "final_round_started":
            await _broadcast(code, "info", {
                "message": "Final round started! All other players get one last turn.",
                "event": ev
            })
        elif et == "last_turn_taken":
            await _broadcast(code, "info", {
                "message": f"Last turn taken. Remaining: {ev.get('lastTurnsRemaining')}",
                "event": ev
            })
        elif et == "round_ended":
            await _broadcast(code, "info", {
                "message": "Round ended. Scores calculated.",
                "event": ev
            })
        elif et == "new_round_started":
            await _broadcast(code, "info", {
                "message": f"New round started (Round {ev.get('roundIndex')}).",
                "event": ev
            })
        elif et == "game_over":
            await _broadcast(code, "info", {
                "message": "Game over! Threshold reached.",
                "event": ev
            })
        else:
            await _broadcast(code, "info", {
                "message": f"Engine event: {et}",
                "event": ev
            })


async def _refresh_all(code: str, engine) -> None:
    public = engine.public_state()
    if DEBUG_SETS:
        print("\n--- DEBUG public_state ---")
        find_sets(public)
    await _broadcast(code, "game_public_state", public)
    await _send_private_all(code, engine)


# -------------------------
# WebSocket endpoint
# -------------------------
@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    print("WS CONNECT")
    await ws.accept()

    ws.state.code = None
    ws.state.player_id = None

    try:
        while True:
            raw = await ws.receive_json()
            msg = ClientMessage(**raw)
            t = msg.type
            p = msg.payload or {}

            # -------------------------
            # TABLE creates a game
            # -------------------------
            if t == "create_table":
                engine = store.create_game()
                ws.state.code = engine.game.code
                store.register_socket(engine.game.code, ws)

                await _send(ws, "table_created", {"code": engine.game.code})
                await _broadcast(engine.game.code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # JOIN game (player)
            # -------------------------
            if t == "join_game":
                code = str(p.get("code", "")).strip().upper()
                name = str(p.get("name", "Player")).strip()[:24]

                try:
                    engine = store.get_game(code)
                except Exception as e:
                    await _send(ws, "error", {"message": f"Join failed: {e}"})
                    continue

                ws.state.code = code
                store.register_socket(code, ws)

                try:
                    player_id, token = engine.add_player(name)
                except Exception as e:
                    await _send(ws, "error", {"message": f"Join failed: {e}"})
                    continue

                ws.state.player_id = player_id

                await _send(ws, "joined", {"playerId": player_id, "token": token, "code": code})
                await _send(ws, "player_private_state", engine.private_state(player_id))
                await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # RESUME game (player reconnect)
            # -------------------------
            if t == "resume_game":
                code = str(p.get("code", "")).strip().upper()
                token = str(p.get("token", "")).strip()

                try:
                    engine = store.get_game(code)
                except Exception as e:
                    await _send(ws, "error", {"message": f"Resume failed: {e}"})
                    continue

                try:
                    player_id = engine.player_id_from_token(token)
                except Exception:
                    await _send(ws, "error", {"message": "Invalid token"})
                    continue

                ws.state.code = code
                ws.state.player_id = player_id
                store.register_socket(code, ws)

                await _send(ws, "player_private_state", engine.private_state(player_id))
                await _broadcast(code, "game_public_state", engine.public_state())
                continue


            # -------------------------
            # Must be bound to a game
            # -------------------------
            code = ws.state.code
            if not code:
                await _send(ws, "error", {"message": "Not in a game yet. Create or join first."})
                continue

            engine = store.get_game(code)

            # -------------------------
            # DEBUG (dev only)
            # -------------------------
            DEBUG = True # Toggle this to enable debug features
            if DEBUG and t == "debug_set_player_grid":
                token = str(p.get("token", ""))
                values = p.get("values")
                face_up = p.get("faceUp")
                removed = p.get("removed")

                try:
                    player_id = engine.player_id_from_token(token)
                    pl = engine._get_player(player_id)
                    if values is not None:
                        pl.grid_values = list(values)
                    if face_up is not None:
                        pl.grid_face_up = list(face_up)
                    if removed is not None:
                        pl.grid_removed = list(removed)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _refresh_all(code, engine)
                await _broadcast(code, "info", {"message": "DEBUG: player grid set"})
                # deterministisch einde
                await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # READY
            # -------------------------
            if t == "set_ready":
                token = str(p.get("token", ""))
                ready = bool(p.get("ready", True))

                try:
                    player_id = engine.player_id_from_token(token)
                except Exception:
                    await _send(ws, "error", {"message": "Invalid token"})
                    continue

                engine.set_ready(player_id, ready)
                started = engine.start_game_if_ready()

                await _refresh_all(code, engine)
                if started:
                    await _broadcast(code, "info", {"message": "Game started. Each player reveal 2 cards."})
                    # ✅ deterministisch: laatste bericht is public_state
                    await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # SETUP REVEAL
            # -------------------------
            if t == "setup_reveal":
                token = str(p.get("token", ""))
                index = int(p.get("index", -1))

                try:
                    player_id = engine.player_id_from_token(token)
                    removed_events = engine.reveal_setup_card(player_id, index)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _refresh_all(code, engine)

                if removed_events:
                    player_name = engine._get_player(player_id).name
                    for ev in removed_events:
                        await _broadcast(code, "info", {
                            "message": f"Column removed for {player_name} (value {ev['value']})",
                            "event": {"type": "column_removed", "playerId": player_id, **ev}
                        })

                if engine.game.phase.value == "TURN_CHOOSE_SOURCE":
                    await _broadcast(code, "info", {"message": "Setup done. Turns can begin."})
                    # ✅ deterministisch einde
                    await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # TURN: draw from deck
            # -------------------------
            if t == "draw_from_deck":
                token = str(p.get("token", ""))
                try:
                    player_id = engine.player_id_from_token(token)
                    engine.draw_from_deck(player_id)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _broadcast(code, "game_public_state", engine.public_state())
                await _send_private(code, engine, player_id)
                continue

            # -------------------------
            # TURN: take discard
            # -------------------------
            if t == "take_discard":
                token = str(p.get("token", ""))
                try:
                    player_id = engine.player_id_from_token(token)
                    engine.take_discard(player_id)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _broadcast(code, "game_public_state", engine.public_state())
                await _send_private(code, engine, player_id)
                continue

            # -------------------------
            # TURN: discard drawn card
            # -------------------------
            if t == "discard_drawn":
                token = str(p.get("token", ""))
                try:
                    player_id = engine.player_id_from_token(token)
                    engine.discard_drawn(player_id)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _refresh_all(code, engine)
                await _broadcast_engine_events(code, engine)

                if engine.game.phase.value == "ROUND_OVER":
                    await _refresh_all(code, engine)

                # ✅ deterministisch einde
                await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # TURN: discard drawn card and reveal
            # -------------------------
            if t == "discard_drawn_and_reveal":
                token = str(p.get("token", ""))
                index = int(p.get("index", -1))

                try:
                    player_id = engine.player_id_from_token(token)
                    removed_events = engine.discard_drawn_and_reveal(player_id, index)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _refresh_all(code, engine)

                if removed_events:
                    player_name = engine._get_player(player_id).name
                    for ev in removed_events:
                        await _broadcast(code, "info", {
                            "message": f"Column removed for {player_name} (value {ev['value']})",
                            "event": {"type": "column_removed", "playerId": player_id, **ev}
                        })

                await _broadcast_engine_events(code, engine)

                if engine.game.phase.value == "ROUND_OVER":
                    await _refresh_all(code, engine)

                # ✅ deterministisch einde
                await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # TURN: swap into grid
            # -------------------------
            if t == "swap_into_grid":
                token = str(p.get("token", ""))
                index = int(p.get("index", -1))

                try:
                    player_id = engine.player_id_from_token(token)
                    removed_events = engine.swap_into_grid(player_id, index)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _refresh_all(code, engine)

                if removed_events:
                    player_name = engine._get_player(player_id).name
                    for ev in removed_events:
                        await _broadcast(code, "info", {
                            "message": f"Column removed for {player_name} (value {ev['value']})",
                            "event": {"type": "column_removed", "playerId": player_id, **ev}
                        })

                await _broadcast_engine_events(code, engine)

                if engine.game.phase.value == "ROUND_OVER":
                    await _refresh_all(code, engine)

                # ✅ deterministisch einde
                await _broadcast(code, "game_public_state", engine.public_state())
                continue

            # -------------------------
            # ROUND: start new round
            # -------------------------
            if t == "start_new_round":
                token = str(p.get("token", ""))
                try:
                    player_id = engine.player_id_from_token(token)
                    engine.start_new_round(player_id)
                except Exception as e:
                    await _send(ws, "error", {"message": str(e)})
                    continue

                await _refresh_all(code, engine)
                await _broadcast_engine_events(code, engine)
                await _broadcast(code, "info", {"message": "New round: each player reveal 2 cards."})

                # ✅ CRUCIAAL: laatste bericht is game_public_state met SETUP_REVEAL
                await _broadcast(code, "game_public_state", engine.public_state())
                continue

            await _send(ws, "error", {"message": f"Unknown event type: {t}"})

    except WebSocketDisconnect:
        if ws.state.code:
            store.unregister_socket(ws.state.code, ws)
