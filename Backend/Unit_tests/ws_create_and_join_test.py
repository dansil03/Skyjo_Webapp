import asyncio, json
import websockets

async def main():
    uri = "ws://127.0.0.1:8001/ws"

    # Table creates game
    async with websockets.connect(uri) as table_ws:
        await table_ws.send(json.dumps({"type":"create_table","payload":{}}))

        created = json.loads(await table_ws.recv())
        code = created["payload"]["code"]
        print("CODE:", code)

        _ = await table_ws.recv()  # game_public_state

        # Player joins same game
        async with websockets.connect(uri) as player_ws:
            await player_ws.send(json.dumps({
                "type":"join_game",
                "payload":{"code": code, "name":"Silas"}
            }))

            # read a few server messages
            for _ in range(3):
                print("PLAYER:", await player_ws.recv())

asyncio.run(main())
