import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import {
  clearPlayerStorage,
  loadPlayerStorage,
  loadTableSelection,
  saveTableSelection,
  type TableSelectionState,
} from '../lib/storage'
import type { GameMeta, GamePublicState, GridCell, PlayerPrivateState } from '../types/skyjo'
import './PlayerView.css'

type PlayerSession = {
  token: string
  playerId: string
  code: string
  name: string
}

type PlayerViewProps = {
  socket: ReturnType<typeof useSkyjoSocket>
  publicState: GamePublicState | null
  privateState: PlayerPrivateState | null
  privateMeta: GameMeta | null
  playerSession: PlayerSession | null
  playerName: string
  onPlayerNameChange: (name: string) => void
  lastInfo: string | null
  lastError: string | null
  onClearPlayerSession: () => void
}

const GRID_SIZE = 12

const emptyGrid: GridCell[] = Array.from({ length: GRID_SIZE }, (_, i) => ({
  i,
  isRemoved: false,
  isFaceUp: false,
  value: null,
}))

const cardImageMap = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../Skyjo-karten/*.png', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, url]) => {
    const fileName = path.split('/').pop()?.replace('.png', '') ?? ''
    return [fileName, url]
  }),
) as Record<string, string>

const EMPTY_SELECTION: TableSelectionState = {
  selectedSource: null,
  deckMode: 'swap',
  locked: false,
  selectedValue: null,
}

export function PlayerView({
  socket,
  publicState,
  privateState,
  privateMeta,
  playerSession,
  playerName,
  onPlayerNameChange,
  lastInfo,
  lastError,
  onClearPlayerSession,
}: PlayerViewProps) {
  const stored = loadPlayerStorage()
  const [code, setCode] = useState(stored.code ?? '')

  const [tableSelection, setTableSelection] = useState<TableSelectionState>(() =>
    loadTableSelection(),
  )

  const hasResumedRef = useRef(false)
  const previousPlayerId = useRef<string | null>(privateMeta?.currentPlayerId ?? null)
  const lastSentSelection = useRef<string | null>(null)

  const { status, sendMessage } = socket

  const sendMessageWithLog = useCallback(
    (message: Parameters<typeof sendMessage>[0]) => {
      console.log('[PlayerView] sending message', message)
      sendMessage(message)
    },
    [sendMessage],
  )

  const updateTableSelection = useCallback((selection: TableSelectionState) => {
    setTableSelection(selection)
    saveTableSelection(selection)
  }, [])

  // Resume once after reload
  useEffect(() => {
    if (!playerSession?.token || !playerSession.code) {
      hasResumedRef.current = false
      return
    }
    if (status !== 'open' || hasResumedRef.current) {
      return
    }
    sendMessageWithLog({
      type: 'resume_game',
      payload: { code: playerSession.code, token: playerSession.token },
    })
    hasResumedRef.current = true
  }, [playerSession?.code, playerSession?.token, sendMessageWithLog, status])

  // Sync selection changes across tabs (localStorage selection)
  useEffect(() => {
    const handleStorage = () => {
      setTableSelection(loadTableSelection())
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const currentPlayerId = privateMeta?.currentPlayerId ?? publicState?.currentPlayerId ?? null
  const phase = privateMeta?.phase ?? publicState?.phase ?? 'LOBBY'

  const isMyTurn = useMemo(() => {
    if (!currentPlayerId || !playerSession?.playerId) return false
    return currentPlayerId === playerSession.playerId
  }, [currentPlayerId, playerSession?.playerId])

  const canChooseSource =
    phase === 'TURN_CHOOSE_SOURCE' && isMyTurn && Boolean(playerSession?.token)

  const canResolveTurn =
    phase === 'TURN_RESOLVE' && isMyTurn && privateState?.drawnCard !== null

  const hasSelection = tableSelection.selectedSource !== null
  const canGridAction = canResolveTurn && hasSelection

  const setupRevealsDone = privateState?.setupRevealsDone ?? 0
  const canSetupReveal =
    phase === 'SETUP_REVEAL' && Boolean(playerSession?.token) && setupRevealsDone < 2

  const backImage = cardImageMap['Rückseite']

  const gridToRender = useMemo<GridCell[]>(
    () => privateState?.grid ?? emptyGrid,
    [privateState?.grid],
  )

  const points = useMemo(() => {
    if (!privateState?.grid) return 0
    return privateState.grid.reduce((total, cell) => {
      if (cell.isRemoved || !cell.isFaceUp || typeof cell.value !== 'number') return total
      return total + cell.value
    }, 0)
  }, [privateState?.grid])

  const statusText = useMemo(() => {
    if (phase === 'LOBBY') return 'Warte auf Spielstart'
    if (phase === 'SETUP_REVEAL') return 'Decke 2 Karten auf'

    if (phase === 'TURN_CHOOSE_SOURCE' || phase === 'TURN_RESOLVE') {
      if (!isMyTurn) return 'Warte…'
      if (tableSelection.selectedSource) return 'Wähle eine Karte'
      return 'Du bist dran'
    }

    if (phase === 'ROUND_OVER') return 'Runde beendet'
    if (phase === 'GAME_OVER') return 'Spiel beendet'
    return ''
  }, [isMyTurn, phase, tableSelection.selectedSource])

  const showActionCue = isMyTurn && hasSelection && phase === 'TURN_RESOLVE'

  useEffect(() => {
    console.log('[PlayerView] phase/current/selection', {
      phase,
      currentPlayerId: currentPlayerId ?? null,
      playerId: playerSession?.playerId ?? null,
      selection: tableSelection,
    })
  }, [phase, currentPlayerId, playerSession?.playerId, tableSelection])

  // Reset selection when leaving turn phases or when turn changes
  useEffect(() => {
    if (phase !== 'TURN_CHOOSE_SOURCE' && phase !== 'TURN_RESOLVE') {
      updateTableSelection(EMPTY_SELECTION)
      previousPlayerId.current = currentPlayerId
      lastSentSelection.current = null
      return
    }

    if (previousPlayerId.current && previousPlayerId.current !== currentPlayerId) {
      updateTableSelection(EMPTY_SELECTION)
      lastSentSelection.current = null
    }

    previousPlayerId.current = currentPlayerId
  }, [currentPlayerId, phase, updateTableSelection])

  // When table selection is locked and it's my turn in choose phase, trigger backend action
  useEffect(() => {
    if (!tableSelection.selectedSource || !tableSelection.locked) return
    if (!canChooseSource || !playerSession?.token) return

    const selectionKey = `${tableSelection.selectedSource}-${currentPlayerId ?? 'none'}-${phase}`
    if (lastSentSelection.current === selectionKey) return

    lastSentSelection.current = selectionKey

    if (tableSelection.selectedSource === 'deck') {
      sendMessageWithLog({ type: 'draw_from_deck', payload: { token: playerSession.token } })
      return
    }

    sendMessageWithLog({ type: 'take_discard', payload: { token: playerSession.token } })
  }, [
    canChooseSource,
    currentPlayerId,
    phase,
    playerSession?.token,
    tableSelection.locked,
    tableSelection.selectedSource,
    sendMessageWithLog,
  ])

  const handleGridClick = (index: number) => {
    if (!playerSession?.token) return

    const cell = gridToRender[index]
    if (!cell || cell.isRemoved) return

    if (canSetupReveal && !cell.isFaceUp) {
      sendMessageWithLog({
        type: 'setup_reveal',
        payload: { token: playerSession.token, index },
      })
      return
    }

    if (!canResolveTurn || !tableSelection.selectedSource) return

    if (
      tableSelection.selectedSource === 'deck' &&
      tableSelection.deckMode === 'reveal' &&
      !cell.isFaceUp
    ) {
      sendMessageWithLog({
        type: 'discard_drawn_and_reveal',
        payload: { token: playerSession.token, index },
      })
      updateTableSelection(EMPTY_SELECTION)
      return
    }

    // swap mode (also used for discard selection)
    if (tableSelection.deckMode === 'swap') {
      sendMessageWithLog({
        type: 'swap_into_grid',
        payload: { token: playerSession.token, index },
      })
      updateTableSelection(EMPTY_SELECTION)
    }
  }

  return (
    <section className="player-view">
      <div className="player-view__hud">
        <div className="player-view__points">Punkte: {points}</div>

        {phase === 'LOBBY' && playerSession?.name && (
          <div className="player-view__joined">joined as {playerSession.name}</div>
        )}

        {statusText && (
          <div
            className={`player-view__status ${
              showActionCue ||
              (phase === 'TURN_CHOOSE_SOURCE' && isMyTurn && tableSelection.selectedSource)
                ? 'player-view__status--active'
                : ''
            }`}
          >
            {statusText}
          </div>
        )}
      </div>

      <div className="player-view__table">
        <div className={`player-grid ${showActionCue ? 'player-grid--pulse' : ''}`}>
          {gridToRender.map((cell) => {
            const isRightColumn = cell.i % 4 === 3
            const canRevealCell = canSetupReveal && !cell.isFaceUp && !cell.isRemoved
            const canResolveCell = canGridAction && !cell.isRemoved

            const shouldRevealOnly =
              tableSelection.selectedSource === 'deck' && tableSelection.deckMode === 'reveal'
            const canRevealAction = canResolveCell && shouldRevealOnly && !cell.isFaceUp
            const canSwapAction =
              canResolveCell && (!shouldRevealOnly || tableSelection.deckMode === 'swap')

            const isClickable = canRevealCell || canRevealAction || canSwapAction
            const actionClass = isClickable ? 'player-grid__cell--action' : ''

            const cardImage = cell.isRemoved
              ? null
              : cell.isFaceUp && cell.value !== null
                ? cardImageMap[String(cell.value)]
                : backImage

            return (
              <button
                key={cell.i}
                type="button"
                className={`player-grid__cell ${actionClass} ${
                  cell.isRemoved ? 'player-grid__cell--removed' : ''
                } ${isRightColumn ? 'player-grid__cell--right' : ''}`}
                onClick={() => handleGridClick(cell.i)}
                disabled={!isClickable}
              >
                {cardImage ? (
                  <img className="player-grid__image" src={cardImage} alt="Spielkarte" />
                ) : (
                  <span className="player-grid__removed-label">entfernt</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {canResolveTurn && tableSelection.selectedSource === 'deck' && (
        <button
          type="button"
          className="player-view__action-button"
          onClick={() => {
            if (!playerSession?.token) return
            sendMessageWithLog({ type: 'discard_drawn', payload: { token: playerSession.token } })
            updateTableSelection(EMPTY_SELECTION)
          }}
        >
          Discard drawn
        </button>
      )}

      {phase === 'LOBBY' && !playerSession?.token && (
        <form
          className="player-view__join"
          onSubmit={(event) => {
            event.preventDefault()
            sendMessageWithLog({ type: 'join_game', payload: { code, name: playerName } })
          }}
        >
          <label>
            <span>Join code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABCD"
            />
          </label>
          <label>
            <span>Name</span>
            <input
              value={playerName}
              onChange={(event) => onPlayerNameChange(event.target.value)}
              placeholder="Your name"
            />
          </label>
          <button type="submit">Join table</button>
        </form>
      )}

      {playerSession?.token && (
        <button
          type="button"
          className="player-view__clear"
          onClick={() => {
            clearPlayerStorage()
            onClearPlayerSession()
          }}
        >
          Clear local player data
        </button>
      )}

      {lastInfo && <div className="player-view__info">{lastInfo}</div>}
      {lastError && <div className="player-view__error">{lastError}</div>}
      <div className="player-view__connection">socket: {status}</div>
    </section>
  )
}
