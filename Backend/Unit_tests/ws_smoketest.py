import asyncio, json
import websockets

async def main():
    uri = "ws://127.0.0.1:8001/ws"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type":"create_table","payload":{}}))
        print("RECV1:", await ws.recv())
        print("RECV2:", await ws.recv())

asyncio.run(main())
