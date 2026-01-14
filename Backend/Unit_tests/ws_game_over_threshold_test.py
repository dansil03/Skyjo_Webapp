import asyncio
import json
import websockets
import time

PORT = 8001
URI = f"ws://127.0.0.1:{PORT}/ws"


async def recv_any(ws):
    return json.loads(await ws.recv())


async def recv_until_type(ws, wanted_type: str):
    while True:
        msg = await recv_any(ws)
        if msg.get("type") == wanted_type:
            return msg


async def recv_until_info_event(ws, wanted_event_type: str):
    while True:
        msg = await recv_any(ws)
        if msg.get("type") != "info":
            continue
        ev = (msg.get("payload") or {}).get("event") or {}
        if ev.get("type") == wanted_event_type:
            return msg


async def wait_for_phase(table_ws, phase: str, timeout_s: float = 3.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(table_ws)
        if msg.get("type") == "game_public_state":
            g = msg.get("payload", {}).get("game", {})
            if g.get("phase") == phase:
                return msg
    raise AssertionError(f"Timeout waiting for phase={phase}")


async def drain_initial_join_messages(player_ws, expected_private=True):
    got_private = False
    got_public = False
    for _ in range(8):
        msg = await recv_any(player_ws)
        if msg.get("type") == "player_private_state":
            got_private = True
        elif msg.get("type") == "game_public_state":
            got_public = True
        if (not expected_private or got_private) and got_public:
            return


async def main():
    # TABLE creates game
    table = await websockets.connect(URI)
    await table.send(json.dumps({"type": "create_table", "payload": {}}))
    created = await recv_until_type(table, "table_created")
    code = created["payload"]["code"]

    await wait_for_phase(table, "LOBBY")
    print("CODE:", code)

    # P1 join
    p1 = await websockets.connect(URI)
    await p1.send(json.dumps({"type": "join_game", "payload": {"code": code, "name": "P1"}}))
    t1 = (await recv_until_type(p1, "joined"))["payload"]["token"]
    await drain_initial_join_messages(p1)

    # P2 join
    p2 = await websockets.connect(URI)
    await p2.send(json.dumps({"type": "join_game", "payload": {"code": code, "name": "P2"}}))
    t2 = (await recv_until_type(p2, "joined"))["payload"]["token"]
    await drain_initial_join_messages(p2)

    # Ready both -> start game
    await p1.send(json.dumps({"type": "set_ready", "payload": {"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type": "set_ready", "payload": {"token": t2, "ready": True}}))

    await recv_until_type(table, "info")
    await wait_for_phase(table, "SETUP_REVEAL")

    # Setup reveals 2 each
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 0}}))
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 5}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 1}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 6}}))

    await wait_for_phase(table, "TURN_CHOOSE_SOURCE")

    # --- Force VERY high round score so totals >= 100 after ROUND_OVER ---
    # Set both players 12 everywhere & face up.
    await p1.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t1, "values": [12] * 12, "faceUp": [True] * 12, "removed": [False] * 12}
    }))
    await recv_until_type(table, "info")

    await p2.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t2, "values": [12] * 12, "faceUp": [True] * 12, "removed": [False] * 12}
    }))
    await recv_until_type(table, "info")

    # End the round: P1 draw+discard, then P2 draw+discard
    await p1.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t1}}))
    await recv_until_type(p1, "player_private_state")
    await p1.send(json.dumps({"type": "discard_drawn", "payload": {"token": t1}}))

    await wait_for_phase(table, "TURN_CHOOSE_SOURCE")

    await p2.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t2}}))
    await recv_until_type(p2, "player_private_state")
    await p2.send(json.dumps({"type": "discard_drawn", "payload": {"token": t2}}))

    await recv_until_info_event(table, "round_ended")
    await wait_for_phase(table, "ROUND_OVER")
    print("Round is ROUND_OVER. Triggering start_new_round...")

    # This should now trigger GAME_OVER (threshold reached)
    await p1.send(json.dumps({"type": "start_new_round", "payload": {"token": t1}}))

    go = await recv_until_info_event(table, "game_over")
    print("GAME OVER EVENT:", go["payload"]["event"])

    state = await wait_for_phase(table, "GAME_OVER")
    game = state.get("payload", {}).get("game", {})

    assert game.get("phase") == "GAME_OVER"
    assert game.get("totalScores") is not None
    print("✅ GAME_OVER reached. totalScores:", game.get("totalScores"))

    await p1.close()
    await p2.close()
    await table.close()


asyncio.run(main())
