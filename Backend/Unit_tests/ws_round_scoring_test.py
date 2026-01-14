import asyncio
import json
import websockets

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
    """
    Waits for messages of type 'info' with payload.event.type == wanted_event_type.
    Prints other info events (useful for debugging).
    """
    while True:
        msg = await recv_any(ws)
        if msg.get("type") != "info":
            continue
        ev = (msg.get("payload") or {}).get("event") or {}
        if ev.get("type") == wanted_event_type:
            return msg
        # Optional: see other info events while waiting
        # print("INFO (other):", msg.get("payload", {}).get("message"), ev)


async def wait_for_phase(table_ws, phase: str):
    while True:
        msg = await recv_any(table_ws)
        if msg.get("type") == "game_public_state":
            g = msg.get("payload", {}).get("game", {})
            if g.get("phase") == phase:
                return msg


async def drain_initial_join_messages(player_ws, expected_private=True):
    """
    After join_game, server sends:
      1) joined
      2) player_private_state
      3) game_public_state broadcast (often received too)
    This helper makes the test less brittle if message order varies slightly.
    """
    # We already read "joined" outside; now drain a bit
    got_private = False
    got_public = False
    for _ in range(5):
        msg = await recv_any(player_ws)
        if msg.get("type") == "player_private_state":
            got_private = True
        elif msg.get("type") == "game_public_state":
            got_public = True
        if (not expected_private or got_private) and got_public:
            return
    # Not fatal; just proceed.


async def main():
    # TABLE creates game
    table = await websockets.connect(URI)
    await table.send(json.dumps({"type": "create_table", "payload": {}}))
    created = await recv_until_type(table, "table_created")
    code = created["payload"]["code"]

    # initial public state
    await wait_for_phase(table, "LOBBY")
    print("CODE:", code)

    # P1 join
    p1 = await websockets.connect(URI)
    await p1.send(json.dumps({"type": "join_game", "payload": {"code": code, "name": "Silas"}}))
    joined1 = await recv_until_type(p1, "joined")
    t1 = joined1["payload"]["token"]
    await drain_initial_join_messages(p1)

    # P2 join
    p2 = await websockets.connect(URI)
    await p2.send(json.dumps({"type": "join_game", "payload": {"code": code, "name": "Player2"}}))
    joined2 = await recv_until_type(p2, "joined")
    t2 = joined2["payload"]["token"]
    await drain_initial_join_messages(p2)

    # Ready both
    await p1.send(json.dumps({"type": "set_ready", "payload": {"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type": "set_ready", "payload": {"token": t2, "ready": True}}))

    started_info = await recv_until_type(table, "info")
    print("INFO:", started_info["payload"]["message"])

    # Setup reveals 2 each (minimal)
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 0}}))
    await p1.send(json.dumps({"type": "setup_reveal", "payload": {"token": t1, "index": 5}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 1}}))
    await p2.send(json.dumps({"type": "setup_reveal", "payload": {"token": t2, "index": 6}}))

    # Wait until turns start
    await wait_for_phase(table, "TURN_CHOOSE_SOURCE")
    print("Turns started.")

    # ---- Force P1 to be "one move away" from finishing ----
    values_p1 = [1] * 12
    face_p1 = [True] * 12
    face_p1[2] = False
    rem_p1 = [False] * 12

    await p1.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t1, "values": values_p1, "faceUp": face_p1, "removed": rem_p1}
    }))
    # wait for the debug ack info (ignore other info)
    await recv_until_type(table, "info")

    # ---- Force P2 all zeros (so finisher is NOT lowest => doubling) ----
    values_p2 = [0] * 12
    face_p2 = [False] * 12
    rem_p2 = [False] * 12

    await p2.send(json.dumps({
        "type": "debug_set_player_grid",
        "payload": {"token": t2, "values": values_p2, "faceUp": face_p2, "removed": rem_p2}
    }))
    await recv_until_type(table, "info")

    # ---- P1 turn: draw + swap into index 2 -> P1 becomes done => final round starts ----
    await p1.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t1}}))
    await recv_until_type(p1, "player_private_state")  # drawnCard visible here

    await p1.send(json.dumps({"type": "swap_into_grid", "payload": {"token": t1, "index": 2}}))

    # Wait explicitly for final_round_started (ignore column_removed etc.)
    fr_msg = await recv_until_info_event(table, "final_round_started")
    print("FINAL ROUND EVENT:", fr_msg["payload"]["event"])

    # ---- P2 last turn: draw + discard ----
    await p2.send(json.dumps({"type": "draw_from_deck", "payload": {"token": t2}}))
    await recv_until_type(p2, "player_private_state")
    await p2.send(json.dumps({"type": "discard_drawn", "payload": {"token": t2}}))

    # Wait explicitly for round_ended
    re_msg = await recv_until_info_event(table, "round_ended")
    round_ev = re_msg["payload"]["event"]
    print("ROUND ENDED EVENT:", round_ev)

    # Finally read the public state with scores (ROUND_OVER)
    while True:
        msg = await recv_any(table)
        if msg.get("type") == "game_public_state":
            game = msg.get("payload", {}).get("game", {})
            if game.get("phase") == "ROUND_OVER":
                print("SCORES:", game.get("roundScores"), "doubled:", game.get("finisherDoubled"))
                break

    await p1.close()
    await p2.close()
    await table.close()


asyncio.run(main())
