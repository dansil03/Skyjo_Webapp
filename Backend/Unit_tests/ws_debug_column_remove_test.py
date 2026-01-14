import asyncio, json
import websockets

URI = "ws://127.0.0.1:8000/ws"

async def recv_until(ws, wanted_type: str):
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("type") == wanted_type:
            return msg

async def main():
    table = await websockets.connect(URI)
    await table.send(json.dumps({"type":"create_table","payload":{}}))
    created = json.loads(await table.recv())
    code = created["payload"]["code"]
    await table.recv()
    print("CODE:", code)

    p1 = await websockets.connect(URI)
    await p1.send(json.dumps({"type":"join_game","payload":{"code": code, "name":"Silas"}}))
    joined1 = json.loads(await p1.recv())
    t1 = joined1["payload"]["token"]
    await p1.recv(); await p1.recv()

    p2 = await websockets.connect(URI)
    await p2.send(json.dumps({"type":"join_game","payload":{"code": code, "name":"Player2"}}))
    joined2 = json.loads(await p2.recv())
    t2 = joined2["payload"]["token"]
    await p2.recv(); await p2.recv()

    await p1.send(json.dumps({"type":"set_ready","payload":{"token": t1, "ready": True}}))
    await p2.send(json.dumps({"type":"set_ready","payload":{"token": t2, "ready": True}}))

    # wait for start
    info = await recv_until(table, "info")
    print("INFO:", info["payload"]["message"])

    # force remove column 0 with value 7 for player1
    await p1.send(json.dumps({"type":"debug_set_column","payload":{"token": t1, "col": 0, "value": 7}}))

    # table should receive public update + info
    for _ in range(3):
        msg = json.loads(await table.recv())
        print("TABLE:", msg)

    # player1 should have removed slots in private state
    # Read a couple messages from p1 and pick the latest private state
    latest_priv = None
    for _ in range(5):
        msg = json.loads(await p1.recv())
        if msg.get("type") == "player_private_state":
            latest_priv = msg

    if latest_priv:
        removed_slots = [c["i"] for c in latest_priv["payload"]["me"]["grid"] if c["isRemoved"]]
        print("P1 removed slots:", removed_slots)
    else:
        print("No player_private_state received on p1 (yet).")


        await p1.close(); await p2.close(); await table.close()

asyncio.run(main())
