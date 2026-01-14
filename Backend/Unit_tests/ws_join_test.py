import asyncio, json
import websockets

CODE = "YAEQ"  # <-- de code uit je table_created

async def main():
    uri = "ws://127.0.0.1:8001/ws"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({
            "type": "join_game",
            "payload": {"code": CODE, "name": "Silas"}
        }))

        # We expect: "joined", "player_private_state", and a "game_public_state" broadcast
        for _ in range(3):
            msg = await ws.recv()
            print("RECV:", msg)

asyncio.run(main())
