import asyncio, json
import websockets

URI = "ws://127.0.0.1:8001/ws"
TIMEOUT = 8.0

async def recv_any(ws):
    raw = await ws.recv()
    return json.loads(raw)

async def recv_until(ws, predicate, label="recv_until"):
    last = None
    try:
        while True:
            msg = await asyncio.wait_for(recv_any(ws), timeout=TIMEOUT)
            last = msg
            if predicate(msg):
                return msg
    except asyncio.TimeoutError:
        raise RuntimeError(f"[TIMEOUT] {label}. Last message: {last}")

async def wait_phase(ws, phase: str, label=None):
    return await recv_until(
        ws,
        lambda m: (
            m.get("type") == "game_public_state"
            and m.get("payload", {}).get("game", {}).get("phase") == phase
        ),
        label or f"waiting for phase={phase}"
    )

async def wait_info_contains(ws, contains: str, label=None):
    return await recv_until(
        ws,
        lambda m: (
            m.get("type") == "info"
            and contains in m.get("payload", {}).get("message", "")
        ),
        label or f"waiting for info containing '{contains}'"
    )

async def wait_info_event(ws, event_type: str, label=None):
    return await recv_until(
        ws,
        lambda m: (
            m.get("type") == "info"
            and m.get("payload", {}).get("event", {}).get("type") == event_type
        ),
        label or f"waiting for info event type={event_type}"
    )

async def join_player(code: str, name: str):
    ws = await websockets.connect(URI)
    await ws.send(json.dumps({"type":"join_game","payload":{"code": code, "name": name}}))
    joined = json.loads(await ws.recv())
    token = joined["payload"]["token"]
    # consume private + public
    await ws.recv()
    await ws.recv()
    return ws, token, joined["payload"]["playerId"]

async def debug_set_grid(ws, token, values, face_up, removed):
    await ws.send(json.dumps({
        "type":"debug_set_player_grid",
        "payload":{"token": token, "values": values, "faceUp": face_up, "removed": removed}
    }))

async def main():
    print("1) create_table")
    table = await websockets.connect(URI)
    await table.send(json.dumps({"type":"create_table","payload":{}}))
    created = json.loads(await table.recv())
    code = created["payload"]["code"]
    print("CODE:", code)

    # initial public
    await table.recv()
    print("2) lobby ok")

    print("3) join p1")
    p1, t1, p1id = await join_player(code, "Silas")
    print("4) join p2")
    p2, t2, p2id = await join_player(code, "Player2")
    print("5) both joined")

    print("6) set_ready both")
    await p1.send(json.dumps({"type":"set_ready","payload":{"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type":"set_ready","payload":{"token": t2, "ready": True}}))

    # We need both: SETUP_REVEAL + info
    msg = await recv_until(
        table,
        lambda m: (
            (m.get("type") == "game_public_state" and m["payload"]["game"]["phase"] == "SETUP_REVEAL")
            or (m.get("type") == "info" and "Game started" in m.get("payload", {}).get("message",""))
        ),
        "waiting for SETUP_REVEAL or start info"
    )
    if msg["type"] == "info":
        print("INFO:", msg["payload"]["message"])
        await wait_phase(table, "SETUP_REVEAL")
    else:
        info = await wait_info_contains(table, "Game started")
        print("INFO:", info["payload"]["message"])

    print("7) setup reveals (2 each)")
    await p1.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 0}}))
    await p1.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 5}}))
    await p2.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 1}}))
    await p2.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 6}}))

    await wait_phase(table, "TURN_CHOOSE_SOURCE", "waiting for TURN_CHOOSE_SOURCE")
    print("8) turns started")

    # ---- Force a deterministic round end via debug ----
    # Make P1 one card away from finishing (index 2 face-down)
    values_p1 = [1]*12
    face_p1 = [True]*12
    face_p1[2] = False
    rem_p1 = [False]*12

    # Make P2 all zeros (so finisher will NOT be lowest => doubling)
    values_p2 = [0]*12
    face_p2 = [False]*12
    rem_p2 = [False]*12

    print("9) debug set grids")
    await debug_set_grid(p1, t1, values_p1, face_p1, rem_p1)
    await wait_info_contains(table, "DEBUG: player grid set")
    await debug_set_grid(p2, t2, values_p2, face_p2, rem_p2)
    await wait_info_contains(table, "DEBUG: player grid set")

    # Ensure it's P1's turn; in MVP it starts with idx 0 so ok.

    print("10) P1 finishes -> final round starts")
    await p1.send(json.dumps({"type":"draw_from_deck","payload":{"token": t1}}))
    # consume private update from p1 so drawnCard exists
    await recv_until(p1, lambda m: m.get("type") == "player_private_state", "p1 private after draw")

    await p1.send(json.dumps({"type":"swap_into_grid","payload":{"token": t1, "index": 2}}))

    fr = await wait_info_event(table, "final_round_started")
    print("FINAL ROUND EVENT:", fr["payload"]["event"])

    print("11) P2 takes last turn -> round ends")
    await p2.send(json.dumps({"type":"draw_from_deck","payload":{"token": t2}}))
    await recv_until(p2, lambda m: m.get("type") == "player_private_state", "p2 private after draw")
    await p2.send(json.dumps({"type":"discard_drawn","payload":{"token": t2}}))

    ended = await wait_info_event(table, "round_ended")
    ev = ended["payload"]["event"]
    print("ROUND ENDED EVENT:", ev)

    # Wait for ROUND_OVER public (contains roundScores + totals)
    over = await wait_phase(table, "ROUND_OVER", "waiting ROUND_OVER")
    game_over = over["payload"]["game"]
    print("PHASE:", game_over["phase"])
    print("roundScores:", game_over["roundScores"])
    print("finisherDoubled:", game_over["finisherDoubled"])

    round_scores = game_over["roundScores"]
    total_before = dict(game_over.get("totalScores", {}))

    print("12) start_new_round")
    await p1.send(json.dumps({"type":"start_new_round","payload":{"token": t1}}))

    # Expect: new_round_started event + SETUP_REVEAL phase again
    nre = await wait_info_event(table, "new_round_started")
    print("NEW ROUND EVENT:", nre["payload"]["event"])

    setup = await wait_phase(table, "SETUP_REVEAL", "waiting SETUP_REVEAL after new round")
    g2 = setup["payload"]["game"]

    print("13) assertions / sanity checks")
    print("phase:", g2["phase"], "roundIndex:", g2["roundIndex"])
    print("totalScores:", g2["totalScores"])

    # Sanity: roundIndex increment
    if g2["roundIndex"] <= game_over["roundIndex"]:
        raise RuntimeError("roundIndex did not increment!")

    # Sanity: totals include previous round
    # (They should equal old total + round_scores)
    for pid, rs in round_scores.items():
        before = int(total_before.get(pid, 0))
        after = int(g2["totalScores"].get(pid, 0))
        expected = before + int(rs)
        if after != expected:
            raise RuntimeError(f"Total score mismatch for {pid}: expected {expected}, got {after}")

    print("✅ New round works: phase reset + totals updated + roundIndex incremented.")

    await p1.close()
    await p2.close()
    await table.close()

asyncio.run(main())
