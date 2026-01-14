from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Set
from fastapi import WebSocket

from .engine import GameEngine


@dataclass
class GameStore:
    """Stores active games and their associated WebSocket connections."""
    games_by_code: Dict[str, GameEngine] = field(default_factory=dict)
    sockets_by_code: Dict[str, Set[WebSocket]] = field(default_factory=dict)

    def create_game(self) -> GameEngine:
        engine = GameEngine()
        self.games_by_code[engine.game.code] = engine
        self.sockets_by_code.setdefault(engine.game.code, set())
        return engine

    def get_game(self, code: str) -> GameEngine:
        if code not in self.games_by_code:
            raise ValueError("Game not found")
        return self.games_by_code[code]

    def register_socket(self, code: str, ws: WebSocket) -> None:
        self.sockets_by_code.setdefault(code, set()).add(ws)

    def unregister_socket(self, code: str, ws: WebSocket) -> None:
        if code in self.sockets_by_code:
            self.sockets_by_code[code].discard(ws)
            if not self.sockets_by_code[code]:
                # keep dict clean (optional)
                self.sockets_by_code.pop(code, None)

    def sockets(self, code: str) -> Set[WebSocket]:
        return self.sockets_by_code.setdefault(code, set())
