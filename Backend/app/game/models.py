from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict
import uuid


class Phase(str, Enum):
    LOBBY = "LOBBY"
    SETUP_REVEAL = "SETUP_REVEAL"
    TURN_CHOOSE_SOURCE = "TURN_CHOOSE_SOURCE"
    TURN_RESOLVE = "TURN_RESOLVE"
    ROUND_OVER = "ROUND_OVER"
    GAME_OVER = "GAME_OVER"  # later


@dataclass
class Player:
    id: str
    name: str
    ready: bool = False
    has_finished_round: bool = False  # (nog niet gebruikt, maar laat ik staan)

    grid_values: List[int] = field(default_factory=list)
    grid_face_up: List[bool] = field(default_factory=list)
    grid_removed: List[bool] = field(default_factory=list)

    drawn_card: Optional[int] = None
    setup_reveals_done: int = 0


@dataclass
class Game:
    id: str
    code: str
    phase: Phase = Phase.LOBBY
    players: List[Player] = field(default_factory=list)

    deck: List[int] = field(default_factory=list)
    discard: List[int] = field(default_factory=list)
    table_drawn_card: Optional[int] = None

    current_player_idx: int = 0

    grid_size: int = 12
    setup_reveals_per_player: int = 2

    # Final round + scoring
    final_round: bool = False
    finisher_id: Optional[str] = None
    last_turns_remaining: int = 0

    round_scores: Dict[str, int] = field(default_factory=dict)
    finisher_doubled: bool = False

    # Multi-round
    round_index: int = 1
    total_scores: Dict[str, int] = field(default_factory=dict)
    last_round_finisher_id: Optional[str] = None

    def new_player_id(self) -> str:
        return uuid.uuid4().hex[:12]
