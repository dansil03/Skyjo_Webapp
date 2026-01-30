export type GamePhase =
  | 'LOBBY'
  | 'SETUP_REVEAL'
  | 'TURN_CHOOSE_SOURCE'
  | 'TURN_RESOLVE'
  | 'ROUND_OVER'
  | 'GAME_OVER'

export type TableSelectedSource = 'deck' | 'discard' | null

export type TableDeckMode = 'swap' | 'reveal'

export type ClientMessage =
  | { type: 'create_table'; payload: Record<string, never> }
  | { type: 'join_game'; payload: { code: string; name: string } }
  | { type: 'resume_game'; payload: { code: string; token: string } }
  | { type: 'set_ready'; payload: { token: string; ready: boolean } }
  | { type: 'setup_reveal'; payload: { token: string; index: number } }
  | { type: 'draw_from_deck'; payload: { token: string } }
  | { type: 'take_discard'; payload: { token: string } }
  | { type: 'discard_drawn'; payload: { token: string } }
  | { type: 'discard_drawn_and_reveal'; payload: { token: string; index: number } }
  | { type: 'swap_into_grid'; payload: { token: string; index: number } }
  | { type: 'start_new_round'; payload: { token: string } }
  | { type: 'table_set_selection'; payload: { source: TableSelectedSource } }
  | { type: 'table_set_deck_mode'; payload: { mode: TableDeckMode } }

export type RankedTotal = {
  playerId: string
  total: number
}

export type PublicPlayer = {
  id: string
  name: string
  ready: boolean
  revealedCount: number
  removedCount: number
}

export type GamePublicState = {
  id: string
  code: string
  phase: GamePhase
  deckCount: number
  discardTop: number | null
  tableDrawnCard: number | null
  tableSelectedSource: TableSelectedSource
  tableDeckMode: TableDeckMode
  currentPlayerId: string | null
  finalRound: boolean
  finisherId: string | null
  lastTurnsRemaining: number
  roundScores: Record<string, number> | null
  finisherDoubled: boolean | null
  roundIndex: number
  roundHistory: Array<Record<string, number>>
  totalScores: Record<string, number>
  winnerId: string | null
  rankedTotals: RankedTotal[] | null
  players: PublicPlayer[]
}

export type GridCell = {
  i: number
  isRemoved: boolean
  isFaceUp: boolean
  value: number | null
}

export type PlayerPrivateState = {
  playerId: string
  name: string
  drawnCard: number | null
  setupRevealsDone: number
  grid: GridCell[]
}

export type GameMeta = {
  phase: GamePhase
  currentPlayerId: string | null
  finalRound: boolean
  finisherId: string | null
  lastTurnsRemaining: number
  roundIndex: number
  totalScores: Record<string, number>
  winnerId: string | null
  rankedTotals: RankedTotal[] | null
}

export type InfoEvent =
  | {
      type: 'final_round_started'
      finisherId: string
      lastTurnsRemaining: number
    }
  | {
      type: 'round_ended'
      scores: Record<string, number>
      finisherId: string
      finisherDoubled: boolean
    }
  | {
      type: 'game_over'
      threshold: number
      winnerId: string
      rankedTotals: RankedTotal[]
      totalScores: Record<string, number>
    }
  | Record<string, unknown>

export type ServerMessage =
  | { type: 'table_created'; payload: { code: string } }
  | {
      type: 'joined'
      payload: { playerId: string; token: string; code: string }
    }
  | { type: 'game_public_state'; payload: { game: GamePublicState } }
  | {
      type: 'player_private_state'
      payload: { me: PlayerPrivateState; gameMeta: GameMeta }
    }
  | { type: 'info'; payload: { message: string; event?: InfoEvent } }
  | { type: 'error'; payload: { message: string } }
