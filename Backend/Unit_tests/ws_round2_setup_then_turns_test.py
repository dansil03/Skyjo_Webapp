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
    """
    Timeout-safe recv.
    Returns dict, or None on timeout.
    """
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        return json.loads(raw)
    except asyncio.TimeoutError:
        return None


async def recv_until_type(ws, wanted_type: str, timeout_s: float = 5.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(ws, timeout=0.75)
        if msg is None:
            continue
        if msg.get("type") == wanted_type:
            return msg
    raise AssertionError(f"Timeout waiting for type={wanted_type}")


async def recv_until_info_event(ws, wanted_event_type: str, timeout_s: float = 8.0):
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


async def drain_after_join(player_ws, want_private=True, want_public=False, timeout_s: float = 2.0):
    got_private = not want_private
    got_public = not want_public
    deadline = time.time() + timeout_s

    while time.time() < deadline:
        msg = await recv_any(player_ws, timeout=0.5)
        if msg is None:
            continue

        t = msg.get("type")
        if t == "player_private_state":
            got_private = True
        elif t == "game_public_state":
            got_public = True
        elif t == "error":
            raise AssertionError(f"Unexpected error after join: {msg}")

        if got_private and got_public:
            return


async def drain_errors(ws, timeout_s: float = 0.8):
    """
    Drain a socket briefly; if any 'error' appears, fail fast with details.
    Useful after sending actions to a player socket.
    """
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(ws, timeout=0.2)
        if msg is None:
            continue
        if msg.get("type") == "error":
            raise AssertionError(f"Server returned error: {msg.get('payload')}")
    return


async def wait_for_phase(table_ws, phase: str, timeout_s: float = 8.0):
    """
    Robust phase wait: keeps reading public states and remembers the last seen phase.
    Prevents 'missing' a transient phase message.
    """
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


async def wait_for_any_public(table_ws, timeout_s: float = 2.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msg = await recv_any(table_ws, timeout=0.75)
        if msg is None:
            continue
        if msg.get("type") == "game_public_state":
            return msg
    raise AssertionError("Did not receive any game_public_state in time")


# -------------------------
# Test: Round 2 setup -> turns start again
# -------------------------
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
    joined1 = await recv_until_type(p1, "joined")
    t1 = joined1["payload"]["token"]
    await drain_after_join(p1, want_private=True, want_public=False)

    # P2 join
    p2 = await websockets.connect(URI)
    await p2.send(json.dumps({"type": "join_game", "payload": {"code": code, "name": "P2"}}))
    joined2 = await recv_until_type(p2, "joined")
    t2 = joined2["payload"]["token"]
    await drain_after_join(p2, want_private=True, want_public=False)

    # Ready both -> start game
    await p1.send(json.dumps({"type": "set_ready", "payload": {"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type": "set_ready", "payload": {"token": t2, "ready": True}}))

    await wait_for_phase(table, "SETUP_REVEAL")
    print("Round 1 setup reveal started.")

    # Setup reveals round 1 (2 each)
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 0}}))
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 5}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 1}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 6}}))

    # Fail fast if any reveal was rejected
    await drain_errors(p1)
    await drain_errors(p2)

    await wait_for_phase(table, "TURN_CHOOSE_SOURCE")
    print("Round 1 turns started.")

    # --- Force fast end of round 1 ---
    # P1: all face up except one -> finish on swap into index 2
    values_p1 = [1] * 12
    face_p1 = [True] * 12
    face_p1[2] = False
    rem_p1 = [False] * 12

    await p1.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t1, "values": values_p1, "faceUp": face_p1, "removed": rem_p1}
    }))

    # P2: all face up -> their last turn ends immediately
    values_p2 = [0] * 12
    face_p2 = [True] * 12
    rem_p2 = [False] * 12

    await p2.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t2, "values": values_p2, "faceUp": face_p2, "removed": rem_p2}
    }))

    # Let table receive the refresh (no hard dependency on info)
    await wait_for_any_public(table, timeout_s=3.0)

    # P1 turn: draw + swap into last hidden slot -> triggers final_round_started
    await p1.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t1}}))
    await recv_until_type(p1, "player_private_state", timeout_s=5.0)

    await p1.send(json.dumps({"type": "swap_into_grid", "payload": {"token": t1, "index": 2}}))

    fr_msg = await recv_until_info_event(table, "final_round_started", timeout_s=8.0)
    print("FINAL ROUND EVENT:", fr_msg["payload"]["event"])

    # P2 last turn: draw + discard -> triggers round_ended
    await wait_for_phase(table, "TURN_CHOOSE_SOURCE")  # now it's P2's turn again
    await p2.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t2}}))
    await recv_until_type(p2, "player_private_state", timeout_s=5.0)
    await p2.send(json.dumps({"type": "discard_drawn", "payload": {"token": t2}}))

    await recv_until_info_event(table, "round_ended", timeout_s=8.0)
    await wait_for_phase(table, "ROUND_OVER", timeout_s=8.0)
    print("Round 1 is ROUND_OVER.")

    # Start new round
    await p1.send(json.dumps({"type": "start_new_round", "payload": {"token": t1}}))
    await wait_for_phase(table, "SETUP_REVEAL", timeout_s=8.0)
    print("Round 2 setup reveal started.")

    # Setup reveals round 2 (2 each)
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 0}}))
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 5}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 1}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 6}}))

    await drain_errors(p1)
    await drain_errors(p2)

    await wait_for_phase(table, "TURN_CHOOSE_SOURCE", timeout_s=8.0)
    print("✅ Round 2 turns started again (TURN_CHOOSE_SOURCE).")

    await p1.close()
    await p2.close()
    await table.close()


asyncio.run(main())
