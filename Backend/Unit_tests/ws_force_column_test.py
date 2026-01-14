import asyncio, json
import websockets

URI = "ws://127.0.0.1:8001/ws"

async def recv_until(ws, wanted_type: str):
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("type") == wanted_type:
            return msg

async def main():
    # Table creates game
    table = await websockets.connect(URI)
    await table.send(json.dumps({"type":"create_table","payload":{}}))
    created = json.loads(await table.recv())
    code = created["payload"]["code"]
    await table.recv()  # public state
    print("CODE:", code)

    # Player1 joins
    p1 = await websockets.connect(URI)
    await p1.send(json.dumps({"type":"join_game","payload":{"code": code, "name":"Silas"}}))
    joined1 = json.loads(await p1.recv())
    t1 = joined1["payload"]["token"]
    await p1.recv()  # private
    await p1.recv()  # public

    # Player2 joins
    p2 = await websockets.connect(URI)
    await p2.send(json.dumps({"type":"join_game","payload":{"code": code, "name":"Player2"}}))
    joined2 = json.loads(await p2.recv())
    t2 = joined2["payload"]["token"]
    await p2.recv()
    await p2.recv()

    # Ready
    await p1.send(json.dumps({"type":"set_ready","payload":{"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type":"set_ready","payload":{"token": t2, "ready": True}}))

    # Wait until game started
    await recv_until(table, "info")  # "Game started..."
    pub = await recv_until(table, "game_public_state")
    print("PHASE:", pub["payload"]["game"]["phase"])

    # ---- FORCE a column equal for Player1 (server-side shortcut for test) ----
    # We can't directly mutate server state via WS yet, so we'll use a trick:
    # reveal indices 0 and 4 for player1, and then we will swap into index 8 with the same value as 0 and 4
    # But we still don't control values. So for deterministic testing, we add a temporary DEBUG endpoint/event.
    print("\nTo make this deterministic, add the debug event shown below (1 minute), then rerun this script.\n")

    await p1.close(); await p2.close(); await table.close()

asyncio.run(main())
