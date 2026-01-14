import asyncio
import json
import time
import websockets

PORT = 8001
URI = f"ws://127.0.0.1:{PORT}/ws"


# -------------------------
# Robust helpers
# -------------------------
async def recv_any(ws, timeout=1.0):
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        return json.loads(raw)
    except asyncio.TimeoutError:
        return None


async def recv_until_type(ws, wanted_type: str, timeout_s: float = 6.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(ws, timeout=0.75)
        if msg is None:
            continue
        if msg.get("type") == wanted_type:
            return msg
    raise AssertionError(f"Timeout waiting for type={wanted_type}")


async def recv_until_info_event(ws, wanted_event_type: str, timeout_s: float = 10.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(ws, timeout=0.75)
        if msg is None:
            continue
        if msg.get("type") != "info":
            continue
        ev = (msg.get("payload") or {}).get("event") or {}
        if ev.get("type") == wanted_event_type:
            return msg
    raise AssertionError(f"Timeout waiting for info.event.type={wanted_event_type}")


async def drain_after_join(player_ws, timeout_s: float = 2.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(player_ws, timeout=0.5)
        if msg is None:
            continue
        if msg.get("type") == "error":
            raise AssertionError(f"Unexpected error after join: {msg}")
    return


async def drain_errors(ws, timeout_s: float = 1.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(ws, timeout=0.2)
        if msg is None:
            continue
        if msg.get("type") == "error":
            raise AssertionError(f"Server returned error: {msg.get('payload')}")
    return


async def wait_for_phase(table_ws, phase: str, timeout_s: float = 10.0):
    deadline = time.time() + timeout_s
    last_phase = None

    while time.time() < deadline:
        msg = await recv_any(table_ws, timeout=0.75)
        if msg is None:
            continue

        if msg.get("type") == "game_public_state":
            g = msg.get("payload", {}).get("game", {})
            last_phase = g.get("phase")
            if last_phase == phase:
                return msg

    raise AssertionError(f"Timeout waiting for phase={phase}. Last seen phase={last_phase}")


async def wait_for_any_public(table_ws, timeout_s: float = 3.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(table_ws, timeout=0.75)
        if msg is None:
            continue
        if msg.get("type") == "game_public_state":
            return msg
    raise AssertionError("Did not receive any game_public_state in time")


async def wait_for_game_over(table_ws, timeout_s: float = 10.0):
    """
    Robust GAME_OVER wait: accepts either:
      - info event 'game_over', or
      - public_state phase == GAME_OVER
    """
    deadline = time.time() + timeout_s
    last_phase = None

    while time.time() < deadline:
        msg = await recv_any(table_ws, timeout=0.75)
        if msg is None:
            continue

        if msg.get("type") == "info":
            ev = (msg.get("payload") or {}).get("event") or {}
            if ev.get("type") == "game_over":
                return ("event", msg)

        if msg.get("type") == "game_public_state":
            g = msg.get("payload", {}).get("game", {})
            last_phase = g.get("phase")
            if last_phase == "GAME_OVER":
                return ("phase", msg)

    raise AssertionError(f"Timeout waiting for GAME_OVER. Last seen phase={last_phase}")


async def join_player(code: str, name: str):
    ws = await websockets.connect(URI)
    await ws.send(json.dumps({"type": "join_game", "payload": {"code": code, "name": name}}))
    joined = await recv_until_type(ws, "joined")
    token = joined["payload"]["token"]
    await drain_after_join(ws)
    return ws, token, joined["payload"]["playerId"]


async def do_setup_reveal(p1, t1, p2, t2):
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 0}}))
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 5}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 1}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 6}}))

    await drain_errors(p1)
    await drain_errors(p2)


async def force_fast_round_end(
    table,
    p1, t1,
    p2, t2,
    p1_value: int = 1,
    p2_value: int = 0,
):
    """
    Ends the round quickly and deterministically.
    You can control resulting round scores via p1_value/p2_value.
    """
    # P1: all face-up except index 2 -> finishes on swap_into_grid(2)
    values_p1 = [p1_value] * 12
    face_p1 = [True] * 12
    face_p1[2] = False
    rem_p1 = [False] * 12

    await p1.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t1, "values": values_p1, "faceUp": face_p1, "removed": rem_p1}
    }))

    # P2: fully face-up to simplify last turn
    values_p2 = [p2_value] * 12
    face_p2 = [True] * 12
    rem_p2 = [False] * 12

    await p2.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t2, "values": values_p2, "faceUp": face_p2, "removed": rem_p2}
    }))

    await wait_for_any_public(table, timeout_s=3.0)

    # P1 turn: draw then swap into last hidden spot -> triggers final_round_started
    await wait_for_phase(table, "TURN_CHOOSE_SOURCE", timeout_s=8.0)
    await p1.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t1}}))
    await recv_until_type(p1, "player_private_state", timeout_s=6.0)
    await p1.send(json.dumps({"type": "swap_into_grid", "payload": {"token": t1, "index": 2}}))

    fr = await recv_until_info_event(table, "final_round_started", timeout_s=10.0)
    print("FINAL ROUND EVENT:", fr["payload"]["event"])

    # P2 last turn: draw + discard -> triggers round_ended
    await wait_for_phase(table, "TURN_CHOOSE_SOURCE", timeout_s=8.0)
    await p2.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t2}}))
    await recv_until_type(p2, "player_private_state", timeout_s=6.0)
    await p2.send(json.dumps({"type": "discard_drawn", "payload": {"token": t2}}))

    await recv_until_info_event(table, "round_ended", timeout_s=10.0)
    await wait_for_phase(table, "ROUND_OVER", timeout_s=10.0)
    print("Round is ROUND_OVER.")


# -------------------------
# E2E Happy Path: 2 rounds + GAME_OVER
# -------------------------
async def main():
    # TABLE creates game
    table = await websockets.connect(URI)
    await table.send(json.dumps({"type": "create_table", "payload": {}}))
    created = await recv_until_type(table, "table_created")
    code = created["payload"]["code"]
    print("CODE:", code)

    await wait_for_phase(table, "LOBBY")

    # Join 2 players
    p1, t1, _ = await join_player(code, "P1")
    p2, t2, _ = await join_player(code, "P2")

    # Ready both -> start game
    await p1.send(json.dumps({"type": "set_ready", "payload": {"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type": "set_ready", "payload": {"token": t2, "ready": True}}))

    # -------------------------
    # Round 1
    # -------------------------
    await wait_for_phase(table, "SETUP_REVEAL", timeout_s=10.0)
    print("Round 1 setup reveal started.")

    await do_setup_reveal(p1, t1, p2, t2)
    await wait_for_phase(table, "TURN_CHOOSE_SOURCE", timeout_s=10.0)
    print("Round 1 turns started.")

    # End round 1 with small scores
    await force_fast_round_end(table, p1, t1, p2, t2, p1_value=1, p2_value=0)

    # -------------------------
    # Round 2
    # -------------------------
    await p1.send(json.dumps({"type": "start_new_round", "payload": {"token": t1}}))
    await wait_for_phase(table, "SETUP_REVEAL", timeout_s=10.0)
    print("Round 2 setup reveal started.")

    await do_setup_reveal(p1, t1, p2, t2)
    await wait_for_phase(table, "TURN_CHOOSE_SOURCE", timeout_s=10.0)
    print("Round 2 turns started.")

    # End round 2 with HIGH scores so totals cross >= 100
    # 12 * 12 = 144 per player (if no removals), easily triggers GAME_OVER in start_new_round
    await force_fast_round_end(table, p1, t1, p2, t2, p1_value=12, p2_value=12)

    # Trigger next round -> should go GAME_OVER
    print("Triggering start_new_round to check GAME_OVER...")
    await p1.send(json.dumps({"type": "start_new_round", "payload": {"token": t1}}))

    kind, msg = await wait_for_game_over(table, timeout_s=12.0)
    if kind == "event":
        ev = (msg.get("payload") or {}).get("event") or {}
        print("GAME OVER EVENT:", ev)
    else:
        print("GAME OVER reached via phase==GAME_OVER (no explicit event observed).")

    # Confirm GAME_OVER state includes totals + winner fields
    pub = await wait_for_phase(table, "GAME_OVER", timeout_s=10.0)
    game = pub.get("payload", {}).get("game", {})
    totals = game.get("totalScores") or {}
    print("✅ GAME_OVER reached. totalScores:", totals)

    if not totals:
        raise AssertionError("Expected totalScores to be present at GAME_OVER")
    if game.get("winnerId") is None:
        raise AssertionError("Expected winnerId in public_state at GAME_OVER")
    if game.get("rankedTotals") is None:
        raise AssertionError("Expected rankedTotals in public_state at GAME_OVER")

    await p1.close()
    await p2.close()
    await table.close()


asyncio.run(main())
