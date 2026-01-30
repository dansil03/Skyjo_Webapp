from __future__ import annotations

import random
import secrets
import uuid
from typing import Dict, Optional, Tuple, List

from .models import Game, Player, Phase


def _make_join_code(n: int = 4) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


def _build_skyjo_deck() -> List[int]:
    values = [-2, -1, 0] + list(range(1, 13))
    deck: List[int] = []
    for v in values:
        deck.extend([v] * 5)
    random.shuffle(deck)
    return deck


class GameEngine:
    def __init__(self, code: Optional[str] = None):
        self.game = Game(
            id=uuid.uuid4().hex,
            code=code or _make_join_code(),
        )
        self.tokens: Dict[str, str] = {}
        self._events: List[dict] = []
        self._setup_done_counter = 0

    # ---------------------------
    # Event buffer
    # ---------------------------
    def consume_events(self) -> List[dict]:
        ev = list(self._events)
        self._events.clear()
        return ev

    # ---------------------------
    # Lobby
    # ---------------------------
    def add_player(self, name: str) -> Tuple[str, str]:
        if self.game.phase != Phase.LOBBY:
            raise ValueError("Cannot join: game already started")

        player_id = self.game.new_player_id()
        token = secrets.token_urlsafe(16)

        p = Player(id=player_id, name=name)
        self.game.players.append(p)
        self.tokens[token] = player_id
        return player_id, token

    def set_ready(self, player_id: str, ready: bool = True) -> None:
        if self.game.phase != Phase.LOBBY:
            raise ValueError("Cannot change ready state after game start")
        self._get_player(player_id).ready = ready

    def start_game_if_ready(self) -> bool:
        g = self.game
        if g.phase != Phase.LOBBY:
            return False
        if len(g.players) < 2:
            return False
        if not all(p.ready for p in g.players):
            return False

        # init totals if first round
        if not g.total_scores:
            g.total_scores = {p.id: 0 for p in g.players}

        # reset round meta
        g.final_round = False
        g.finisher_id = None
        g.last_turns_remaining = 0
        g.round_scores = {}
        g.finisher_doubled = False
        g.round_histrory = []

        g.deck = _build_skyjo_deck()
        g.discard = []
        g.table_drawn_card = None
        self._reset_table_selection()
        self._setup_done_counter = 0

        for p in g.players:
            p.has_finished_round = False
            p.grid_values = [self._draw() for _ in range(g.grid_size)]
            p.grid_face_up = [False] * g.grid_size
            p.grid_removed = [False] * g.grid_size
            p.drawn_card = None
            p.setup_reveals_done = 0
            p.setup_revealed_indices = []
            p.setup_done_order = None

        g.discard.append(self._draw())
        g.table_drawn_card = None
        g.current_player_idx = 0
        g.phase = Phase.SETUP_REVEAL
        return True

    # ---------------------------
    # Setup reveal
    # ---------------------------
    def reveal_setup_card(self, player_id: str, index: int) -> List[dict]:
        g = self.game
        if g.phase != Phase.SETUP_REVEAL:
            raise ValueError("Not in setup reveal phase")

        p = self._get_player(player_id)

        if not (0 <= index < g.grid_size):
            raise ValueError("Invalid grid index")
        if p.grid_removed[index]:
            raise ValueError("Card already removed")
        if p.grid_face_up[index]:
            raise ValueError("Card already face up")
        if p.setup_reveals_done >= g.setup_reveals_per_player:
            raise ValueError("You already revealed enough cards")

        p.grid_face_up[index] = True
        p.setup_reveals_done += 1
        p.setup_revealed_indices.append(index)
        if p.setup_reveals_done == g.setup_reveals_per_player and p.setup_done_order is None:
            self._setup_done_counter += 1
            p.setup_done_order = self._setup_done_counter

        removed_events = self._check_and_remove_columns(p)

        if self._all_setup_done():
            g.current_player_idx = self._select_starting_player_after_setup()
            g.phase = Phase.TURN_CHOOSE_SOURCE
            self._reset_table_selection()

        return removed_events

    def _select_starting_player_after_setup(self) -> int:
        g = self.game
        best_idx = 0
        best_sum = None
        best_done_order = None
        for idx, p in enumerate(g.players):
            reveal_indices = p.setup_revealed_indices[: g.setup_reveals_per_player]
            reveal_sum = sum(p.grid_values[i] for i in reveal_indices)
            done_order = p.setup_done_order if p.setup_done_order is not None else float("inf")
            if (
                best_sum is None
                or reveal_sum > best_sum
                or (reveal_sum == best_sum and done_order < best_done_order)
            ):
                best_sum = reveal_sum
                best_done_order = done_order
                best_idx = idx
        # Tie-break: highest sum, earliest setup completion, then join order.
        return best_idx

    def _all_setup_done(self) -> bool:
        g = self.game
        return all(p.setup_reveals_done >= g.setup_reveals_per_player for p in g.players)

    # ---------------------------
    # Auth
    # ---------------------------
    def player_id_from_token(self, token: str) -> str:
        if token not in self.tokens:
            raise ValueError("Invalid token")
        return self.tokens[token]

    # ---------------------------
    # State
    # ---------------------------
    def public_state(self) -> dict:
        g = self.game

        def safe_bool(lst: List[bool], i: int, default: bool = False) -> bool:
            return lst[i] if (lst is not None and i < len(lst)) else default

        def revealed_count(p: Player) -> int:
            face = getattr(p, "grid_face_up", []) or []
            rem = getattr(p, "grid_removed", []) or []
            cnt = 0
            for i in range(g.grid_size):
                if safe_bool(face, i, False) or safe_bool(rem, i, False):
                    cnt += 1
            return cnt

        def removed_count(p: Player) -> int:
            rem = getattr(p, "grid_removed", []) or []
            return sum(1 for x in rem if x)

        current_id = None
        if g.players and g.phase != Phase.LOBBY:
            current_id = g.players[g.current_player_idx].id

        winner_id = None
        ranked_totals = None
        if g.phase == Phase.GAME_OVER:
            winner_id, ranked_totals = self._compute_winner_and_ranking()

        return {
            "game": {
                "id": g.id,
                "code": g.code,
                "phase": g.phase.value,
                "deckCount": len(g.deck),
                "discardTop": g.discard[-1] if g.discard else None,
                "tableDrawnCard": g.table_drawn_card if g.phase == Phase.TURN_RESOLVE else None,
                "tableSelectedSource": g.table_selected_source,
                "tableDeckMode": g.table_deck_mode,
                "currentPlayerId": current_id,
                "finalRound": g.final_round,
                "finisherId": g.finisher_id,
                "lastTurnsRemaining": g.last_turns_remaining,

                "roundScores": g.round_scores if g.phase == Phase.ROUND_OVER else None,
                "finisherDoubled": g.finisher_doubled if g.phase == Phase.ROUND_OVER else None,

                "roundIndex": g.round_index,
                "roundHistory": g.round_history,

                # ✅ altijd totals meegeven
                "totalScores": g.total_scores,

                # ✅ alleen bij GAME_OVER
                "winnerId": winner_id,
                "rankedTotals": ranked_totals,

                "players": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "ready": p.ready,
                        "revealedCount": revealed_count(p),
                        "removedCount": removed_count(p),
                    }
                    for p in g.players
                ],
            }
        }

    def private_state(self, player_id: str) -> dict:
        g = self.game
        p = self._get_player(player_id)

        grid: List[dict] = []

        # ✅ robuust lobby-safe: check alle arrays
        lobby_safe = (
            not p.grid_values
            or not p.grid_face_up
            or not p.grid_removed
            or len(p.grid_values) < g.grid_size
            or len(p.grid_face_up) < g.grid_size
            or len(p.grid_removed) < g.grid_size
        )

        if lobby_safe:
            for i in range(g.grid_size):
                grid.append({"i": i, "isRemoved": False, "isFaceUp": False, "value": None})
        else:
            round_over = (g.phase == Phase.ROUND_OVER or g.phase == Phase.GAME_OVER)
            for i in range(g.grid_size):
                if p.grid_removed[i]:
                    grid.append({"i": i, "isRemoved": True, "isFaceUp": False, "value": None})
                    continue

                if round_over:
                    grid.append({"i": i, "isRemoved": False, "isFaceUp": True, "value": p.grid_values[i]})
                else:
                    is_up = p.grid_face_up[i]
                    grid.append({
                        "i": i,
                        "isRemoved": False,
                        "isFaceUp": bool(is_up),
                        "value": (p.grid_values[i] if is_up else None),
                    })

        winner_id = None
        ranked_totals = None
        if g.phase == Phase.GAME_OVER:
            winner_id, ranked_totals = self._compute_winner_and_ranking()

        return {
            "me": {
                "playerId": p.id,
                "name": p.name,
                "drawnCard": p.drawn_card,
                "setupRevealsDone": p.setup_reveals_done,
                "grid": grid,
            },
            "gameMeta": {
                "phase": g.phase.value,
                "currentPlayerId": (
                    g.players[g.current_player_idx].id
                    if g.players and g.phase != Phase.LOBBY
                    else None
                ),
                "finalRound": g.final_round,
                "finisherId": g.finisher_id,
                "lastTurnsRemaining": g.last_turns_remaining,
                "roundIndex": g.round_index,
                "totalScores": g.total_scores,

                # ✅ GAME_OVER extra
                "winnerId": winner_id,
                "rankedTotals": ranked_totals,
            },
        }


    # ---------------------------
    # Turns
    # ---------------------------
    def set_table_selection(self, source: Optional[str]) -> None:
        self._require_not_round_over()
        if self.game.phase not in (Phase.TURN_CHOOSE_SOURCE, Phase.TURN_RESOLVE):
            raise ValueError("Cannot select source right now")
        if source not in ("deck", "discard", None):
            raise ValueError("Invalid selection source")

        self.game.table_selected_source = source
        if source != "deck":
            self.game.table_deck_mode = "swap"

    def set_table_deck_mode(self, mode: str) -> None:
        self._require_not_round_over()
        if self.game.phase not in (Phase.TURN_CHOOSE_SOURCE, Phase.TURN_RESOLVE):
            raise ValueError("Cannot set deck mode right now")
        if mode not in ("swap", "reveal"):
            raise ValueError("Invalid deck mode")
        if self.game.table_selected_source != "deck":
            raise ValueError("Deck mode only valid when deck is selected")

        self.game.table_deck_mode = mode

    def draw_from_deck(self, player_id: str) -> int:
        self._require_not_round_over()
        self._require_phase(Phase.TURN_CHOOSE_SOURCE)
        self._require_current_player(player_id)

        p = self._get_player(player_id)
        if p.drawn_card is not None:
            raise ValueError("You already have a drawn card")

        p.drawn_card = self._draw()
        self.game.table_drawn_card = p.drawn_card
        self.game.phase = Phase.TURN_RESOLVE
        return p.drawn_card

    def take_discard(self, player_id: str) -> int:
        self._require_not_round_over()
        self._require_phase(Phase.TURN_CHOOSE_SOURCE)
        self._require_current_player(player_id)

        if not self.game.discard:
            raise ValueError("Discard is empty")

        p = self._get_player(player_id)
        if p.drawn_card is not None:
            raise ValueError("You already have a drawn card")

        p.drawn_card = self.game.discard.pop()
        self.game.table_drawn_card = None
        self.game.phase = Phase.TURN_RESOLVE
        return p.drawn_card

    def discard_drawn(self, player_id: str) -> None:
        self._require_not_round_over()
        self._require_phase(Phase.TURN_RESOLVE)
        self._require_current_player(player_id)

        p = self._get_player(player_id)
        if p.drawn_card is None:
            raise ValueError("No drawn card to discard")

        self.game.discard.append(p.drawn_card)
        self.game.table_drawn_card = None
        p.drawn_card = None

        self._after_turn_completed(actor_id=player_id)
        if self.game.phase != Phase.ROUND_OVER:
            self._advance_turn()

    def discard_drawn_and_reveal(self, player_id: str, index: int) -> List[dict]:
        self._require_not_round_over()
        self._require_phase(Phase.TURN_RESOLVE)
        self._require_current_player(player_id)

        g = self.game
        p = self._get_player(player_id)

        if p.drawn_card is None:
            raise ValueError("No drawn card to discard")
        if not (0 <= index < g.grid_size):
            raise ValueError("Invalid grid index")
        if p.grid_removed[index]:
            raise ValueError("Cannot reveal a removed slot")
        if p.grid_face_up[index]:
            raise ValueError("Card is already face up")

        g.discard.append(p.drawn_card)
        g.table_drawn_card = None
        p.drawn_card = None
        p.grid_face_up[index] = True

        removed_events = self._check_and_remove_columns(p)

        self._after_turn_completed(actor_id=player_id)
        if g.phase != Phase.ROUND_OVER:
            self._advance_turn()

        return removed_events

    def swap_into_grid(self, player_id: str, index: int) -> List[dict]:
        self._require_not_round_over()
        self._require_phase(Phase.TURN_RESOLVE)
        self._require_current_player(player_id)

        g = self.game
        p = self._get_player(player_id)

        if p.drawn_card is None:
            raise ValueError("No drawn card to place")
        if not (0 <= index < g.grid_size):
            raise ValueError("Invalid grid index")
        if p.grid_removed[index]:
            raise ValueError("Cannot place into a removed slot")

        old = p.grid_values[index]
        p.grid_values[index] = p.drawn_card
        g.table_drawn_card = None
        p.drawn_card = None

        p.grid_face_up[index] = True
        g.discard.append(old)

        removed_events = self._check_and_remove_columns(p)

        self._after_turn_completed(actor_id=player_id)
        if g.phase != Phase.ROUND_OVER:
            self._advance_turn()

        return removed_events

    # ---------------------------
    # Final round + scoring
    # ---------------------------
    def _after_turn_completed(self, actor_id: str) -> None:
        g = self.game
        actor = self._get_player(actor_id)

        if (not g.final_round) and self._is_player_done(actor):
            g.final_round = True
            g.finisher_id = actor_id
            g.last_turns_remaining = len(g.players) - 1
            self._events.append({
                "type": "final_round_started",
                "finisherId": actor_id,
                "lastTurnsRemaining": g.last_turns_remaining,
            })

        if g.final_round and g.finisher_id and actor_id != g.finisher_id and g.last_turns_remaining > 0:
            g.last_turns_remaining -= 1
            self._events.append({
                "type": "last_turn_taken",
                "playerId": actor_id,
                "lastTurnsRemaining": g.last_turns_remaining,
            })

        if g.final_round and g.last_turns_remaining == 0:
            self._end_round()

    def _end_round(self) -> None:
        g = self.game
        scores: Dict[str, int] = {}

        for p in g.players:
            s = 0
            for i in range(g.grid_size):
                if p.grid_removed[i]:
                    continue
                s += p.grid_values[i]
            scores[p.id] = s

        finisher_doubled = False
        if g.finisher_id and g.finisher_id in scores:
            finisher_score = scores[g.finisher_id]
            min_score = min(scores.values())
            if finisher_score > min_score:
                scores[g.finisher_id] = finisher_score * 2
                finisher_doubled = True

        g.round_scores = scores
        g.finisher_doubled = finisher_doubled
        g.last_round_finisher_id = g.finisher_id
        g.round_history.append(scores)
        g.table_drawn_card = None
        self._reset_table_selection()
        g.phase = Phase.ROUND_OVER

        self._events.append({
            "type": "round_ended",
            "scores": scores,
            "finisherId": g.finisher_id,
            "finisherDoubled": finisher_doubled,
        })

    def _is_player_done(self, p: Player) -> bool:
        for i in range(self.game.grid_size):
            if p.grid_removed[i]:
                continue
            if not p.grid_face_up[i]:
                return False
        return True

    # ---------------------------
    # New round
    # ---------------------------
    def _reset_player_for_new_round(self, p: Player) -> None:
        g = self.game
        p.grid_values = [self._draw() for _ in range(g.grid_size)]
        p.grid_face_up = [False] * g.grid_size
        p.grid_removed = [False] * g.grid_size
        p.drawn_card = None
        p.setup_reveals_done = 0
        p.setup_revealed_indices = []
        p.setup_done_order = None
        p.has_finished_round = False

    def _game_over_threshold(self) -> int:
        return 100

    def _compute_winner_and_ranking(self) -> tuple[str | None, list[dict]]:
        """
        Winner = laagste totalScore (klassiek Skyjo: laagste wint zodra iemand >= threshold).
        Returns: (winner_id, rankedTotals)
        """
        g = self.game
        totals = g.total_scores or {}
        if not totals:
            return None, []

        ranked = sorted(totals.items(), key=lambda kv: (kv[1], kv[0]))
        ranked_totals = [{"playerId": pid, "total": score} for pid, score in ranked]
        winner_id = ranked[0][0] if ranked else None
        return winner_id, ranked_totals

    def start_new_round(self, requester_player_id: str) -> None:
        g = self.game
        if g.phase != Phase.ROUND_OVER:
            raise ValueError("Cannot start new round: round not over")

        # add last round to totals
        if not g.total_scores:
            g.total_scores = {p.id: 0 for p in g.players}
        for pid, s in g.round_scores.items():
            g.total_scores[pid] = g.total_scores.get(pid, 0) + int(s)

        # ✅ GAME OVER check (Optie A)
        threshold = self._game_over_threshold()
        if any(score >= threshold for score in g.total_scores.values()):
            g.phase = Phase.GAME_OVER
            g.table_drawn_card = None
            self._reset_table_selection()
            winner_id, ranked_totals = self._compute_winner_and_ranking()

            self._events.append({
                "type": "game_over",
                "threshold": threshold,
                "winnerId": winner_id,
                "rankedTotals": ranked_totals,
                "totalScores": g.total_scores,
            })
            return

        # reset round meta
        g.round_index += 1
        g.final_round = False
        g.finisher_id = None
        g.last_turns_remaining = 0
        g.round_scores = {}
        g.finisher_doubled = False

        # new deck/discard
        g.deck = _build_skyjo_deck()
        g.discard = []
        g.table_drawn_card = None
        self._reset_table_selection()
        self._setup_done_counter = 0

        for p in g.players:
            self._reset_player_for_new_round(p)

        g.discard.append(self._draw())

        # starting player = last finisher, else 0
        if g.last_round_finisher_id:
            idx = next((i for i, pl in enumerate(g.players) if pl.id == g.last_round_finisher_id), 0)
            g.current_player_idx = idx
        else:
            g.current_player_idx = 0

        g.phase = Phase.SETUP_REVEAL

        self._events.append({
            "type": "new_round_started",
            "roundIndex": g.round_index,
            "startingPlayerId": g.players[g.current_player_idx].id if g.players else None,
            "totalScores": g.total_scores,
        })


    # ---------------------------
    # Column removal
    # ---------------------------
    def _column_indices(self) -> List[List[int]]:
        return [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]]

    def _check_and_remove_columns(self, player: Player) -> List[dict]:
        removed_events: List[dict] = []
        for col, idxs in enumerate(self._column_indices()):
            if any(player.grid_removed[i] for i in idxs):
                continue
            if not all(player.grid_face_up[i] for i in idxs):
                continue

            v0 = player.grid_values[idxs[0]]
            if player.grid_values[idxs[1]] == v0 and player.grid_values[idxs[2]] == v0:
                for i in idxs:
                    player.grid_removed[i] = True
                    player.grid_face_up[i] = False
                    self.game.discard.append(player.grid_values[i])
                removed_events.append({"col": col, "value": v0, "indices": idxs})
        return removed_events

    # ---------------------------
    # Internal helpers
    # ---------------------------
    def _reset_table_selection(self) -> None:
        self.game.table_selected_source = None
        self.game.table_deck_mode = "swap"

    def _require_not_round_over(self) -> None:
        if self.game.phase == Phase.ROUND_OVER:
            raise ValueError("Round is over")

    def _require_phase(self, phase: Phase) -> None:
        if self.game.phase != phase:
            raise ValueError(f"Invalid phase. Expected {phase.value}, got {self.game.phase.value}")

    def _current_player(self) -> Player:
        if not self.game.players:
            raise ValueError("No players")
        return self.game.players[self.game.current_player_idx]

    def _require_current_player(self, player_id: str) -> None:
        if self._current_player().id != player_id:
            raise ValueError("Not your turn")

    def _advance_turn(self) -> None:
        self.game.current_player_idx = (self.game.current_player_idx + 1) % len(self.game.players)
        self.game.phase = Phase.TURN_CHOOSE_SOURCE
        self._reset_table_selection()

    def _get_player(self, player_id: str) -> Player:
        for p in self.game.players:
            if p.id == player_id:
                return p
        raise ValueError("Player not found")

    def _draw(self) -> int:
        """
        Draw one card from deck. If deck empty, reshuffle discard except top.
        """
        if not self.game.deck:
            if len(self.game.discard) <= 1:
                raise ValueError("No cards left to draw")
            top = self.game.discard.pop()
            self.game.deck = self.game.discard
            self.game.discard = [top]
            random.shuffle(self.game.deck)

        return self.game.deck.pop()
