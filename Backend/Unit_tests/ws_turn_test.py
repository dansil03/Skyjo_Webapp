import asyncio, json
import websockets

URI = "ws://127.0.0.1:8001/ws"

async def recv_until(ws, wanted_type: str, label=""):
    while True:
        raw = await ws.recv()
        msg = json.loads(raw)
        if label:
            print(label, msg["type"])
        if msg.get("type") == wanted_type:
            return msg


async def table_create():
    ws = await websockets.connect(URI)
    await ws.send(json.dumps({"type":"create_table","payload":{}}))
    created = json.loads(await ws.recv())
    code = created["payload"]["code"]
    await ws.recv()
    return ws, code

async def join(code, name):
    ws = await websockets.connect(URI)
    await ws.send(json.dumps({"type":"join_game","payload":{"code": code, "name": name}}))
    joined = json.loads(await ws.recv())
    token = joined["payload"]["token"]
    await ws.recv()
    await ws.recv()
    return ws, token

async def main():
    table_ws, code = await table_create()
    print("CODE:", code)

    p1_ws, t1 = await join(code, "Silas")
    p2_ws, t2 = await join(code, "Player2")

    await p1_ws.send(json.dumps({"type":"set_ready","payload":{"token": t1, "ready": True}}))
    await p2_ws.send(json.dumps({"type":"set_ready","payload":{"token": t2, "ready": True}}))

    # Drain some table messages until setup starts
    for _ in range(5):
        print("TABLE:", await table_ws.recv())

    # Setup reveals (2 each)
    await p1_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 0}}))
    await p1_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t1, "index": 5}}))
    await p2_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 1}}))
    await p2_ws.send(json.dumps({"type":"setup_reveal","payload":{"token": t2, "index": 6}}))

    for _ in range(4):
        print("TABLE:", await table_ws.recv())

    # Now it's TURN_CHOOSE_SOURCE and player1 is current.
    # Player1 draws from deck
    await p1_ws.send(json.dumps({"type":"draw_from_deck","payload":{"token": t1}}))

    # After draw, player1 should receive player_private_state with drawnCard
    priv = await recv_until(p1_ws, "player_private_state")
    print("P1 private drawnCard:", priv["payload"]["me"]["drawnCard"])


    # Player1 swaps into grid index 2
    await p1_ws.send(json.dumps({"type":"swap_into_grid","payload":{"token": t1, "index": 2}}))

    # Table sees turn advanced + discard changed
    for _ in range(4):
        print("TABLE:", await table_ws.recv())

    await p1_ws.close(); await p2_ws.close(); await table_ws.close()

asyncio.run(main())
