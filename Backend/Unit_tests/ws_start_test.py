import asyncio, json
import websockets

CODE = "YAEQ"

async def join_and_ready(name: str):
    uri = "ws://127.0.0.1:8001/ws"
    ws = await websockets.connect(uri)
    await ws.send(json.dumps({"type": "join_game", "payload": {"code": CODE, "name": name}}))

    joined = json.loads(await ws.recv())  # joined
    token = joined["payload"]["token"]

    await ws.recv()  # player_private_state
    await ws.recv()  # game_public_state

    await ws.send(json.dumps({"type":"set_ready","payload":{"token": token, "ready": True}}))
    return ws, token

async def main():
    ws1, t1 = await join_and_ready("Silas")
    ws2, t2 = await join_and_ready("Player2")

    # Lees een paar broadcasts zodat je ziet dat het spel start
    for _ in range(6):
        print("WS1:", await ws1.recv())

    # Setup reveal (2 kaarten per speler)
    await ws1.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 0}}))
    await ws1.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 5}}))
    await ws2.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 1}}))
    await ws2.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 6}}))

    # Lees updates na setup
    for _ in range(6):
        print("WS1:", await ws1.recv())

    await ws1.close()
    await ws2.close()

asyncio.run(main())
