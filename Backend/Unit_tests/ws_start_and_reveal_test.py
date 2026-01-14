import asyncio, json
import websockets

URI = "ws://127.0.0.1:8001/ws"

async def table_create():
    ws = await websockets.connect(URI)
    await ws.send(json.dumps({"type":"create_table","payload":{}}))
    created = json.loads(await ws.recv())
    code = created["payload"]["code"]
    await ws.recv()  # game_public_state
    return ws, code

async def player_join(code: str, name: str):
    ws = await websockets.connect(URI)
    await ws.send(json.dumps({"type":"join_game","payload":{"code": code, "name": name}}))

    joined = json.loads(await ws.recv())  # joined
    token = joined["payload"]["token"]

    await ws.recv()  # player_private_state
    await ws.recv()  # game_public_state broadcast

    return ws, token

async def main():
    table_ws, code = await table_create()
    print("CODE:", code)

    p1_ws, t1 = await player_join(code, "Silas")
    p2_ws, t2 = await player_join(code, "Player2")

    # Set ready for both
    await p1_ws.send(json.dumps({"type":"set_ready","payload":{"token": t1, "ready": True}}))
    await p2_ws.send(json.dumps({"type":"set_ready","payload":{"token": t2, "ready": True}}))

    # Read some broadcasts from table (it sees everything public)
    for _ in range(5):
        print("TABLE:", await table_ws.recv())

    # Setup reveals: 2 per player
    await p1_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 0}}))
    await p1_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 5}}))
    await p2_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 1}}))
    await p2_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 6}}))

    # Read a few more public updates
    for _ in range(6):
        print("TABLE:", await table_ws.recv())

    await p1_ws.close()
    await p2_ws.close()
    await table_ws.close()

asyncio.run(main())
