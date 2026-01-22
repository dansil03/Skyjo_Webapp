import { useEffect, useMemo, useRef, useState } from 'react'
import type { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import { clearPlayerStorage, loadPlayerStorage } from '../lib/storage'
import type { GamePublicState, PlayerPrivateState } from '../types/skyjo'
import './ViewStyles.css'

type InfoLog = {
  id: string
  message: string
}

const GRID_SIZE = 12

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
  playerSession: PlayerSession | null
  playerName: string
  onPlayerNameChange: (name: string) => void
  lastInfo: string | null
  lastError: string | null
  onClearPlayerSession: () => void
}

export function PlayerView({
  socket,
  publicState,
  privateState,
  playerSession,
  playerName,
  onPlayerNameChange,
  lastInfo,
  lastError,
  onClearPlayerSession,
}: PlayerViewProps) {
  const stored = loadPlayerStorage()
  const [code, setCode] = useState(stored.code ?? '')
  const [indexInput, setIndexInput] = useState('0')
  const [infoLog, setInfoLog] = useState<InfoLog[]>([])
  const hasResumedRef = useRef(false)
  const [isRevealMode, setIsRevealMode] = useState(false)
  const { status, sendMessage } = socket

  useEffect(() => {
    if (!lastInfo) {
      return
    }
    setInfoLog((prev) => [{ id: crypto.randomUUID(), message: lastInfo }, ...prev])
  }, [lastInfo])

  useEffect(() => {
    if (!playerSession?.token || !playerSession.code) {
      hasResumedRef.current = false
      return
    }
    if (status !== 'open' || hasResumedRef.current) {
      return
    }
    sendMessage({
      type: 'resume_game',
      payload: { code: playerSession.code, token: playerSession.token },
    })
    hasResumedRef.current = true
  }, [playerSession?.code, playerSession?.token, sendMessage, status])

  const isMyTurn = useMemo(() => {
    if (!publicState?.currentPlayerId || !playerSession?.playerId) {
      return false
    }
    return publicState.currentPlayerId === playerSession.playerId
  }, [publicState?.currentPlayerId, playerSession?.playerId])

  const phase = publicState?.phase
  const isTurnPhase = phase === 'TURN_CHOOSE_SOURCE' || phase === 'TURN_RESOLVE'

  const parsedIndex = Number(indexInput)
  const isValidIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < GRID_SIZE
  const canDiscardAndReveal =
    phase === 'TURN_RESOLVE' && privateState?.drawnCard !== null && Boolean(playerSession?.token)

  useEffect(() => {
    if (phase !== 'TURN_RESOLVE' || privateState?.drawnCard === null) {
      setIsRevealMode(false)
    }
  }, [phase, privateState?.drawnCard])

  const handleGridClick = (index: number) => {
    if (!isRevealMode || !playerSession?.token) {
      return
    }
    const cell = privateState?.grid?.[index]
    if (!cell || cell.isRemoved || cell.isFaceUp) {
      return
    }
    sendMessage({
      type: 'discard_drawn_and_reveal',
      payload: { token: playerSession.token, index },
    })
    setIsRevealMode(false)
  }

  return (
    <section className="view">
      <header className="view__header">
        <div>
          <h2>Player device</h2>
          <p>Join a table and manage your personal game actions.</p>
        </div>
        <div className="status">
          <span className={`status__dot status__dot--${status}`} />
          <span>{status}</span>
        </div>
      </header>

      <div className="grid">
        <div className="card">
          <h3>Join game</h3>
          {playerSession?.token ? (
            <div className="stack">
              <p className="muted">Joined as {playerSession.name || 'Player'}.</p>
              <div className="pill-group">
                <span className="pill">Code: {playerSession.code}</span>
                <span className="pill">Player ID: {playerSession.playerId}</span>
              </div>
              <button
                type="button"
                className="button--ghost"
                onClick={() => {
                  clearPlayerStorage()
                  onClearPlayerSession()
                }}
              >
                Clear local player data
              </button>
            </div>
          ) : (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage({ type: 'join_game', payload: { code, name: playerName } })
              }}
            >
              <label className="field">
                <span>Join code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="ABCD"
                />
              </label>
              <label className="field">
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
          {lastError && <p className="error">{lastError}</p>}
        </div>

        <div className="card">
          <h3>Game state</h3>
          <div className="state-grid">
            <div>
              <span className="label">Phase</span>
              <span>{phase ?? '—'}</span>
            </div>
            <div>
              <span className="label">Your turn</span>
              <span>{isMyTurn ? 'Yes' : 'No'}</span>
            </div>
            <div>
              <span className="label">Drawn card</span>
              <span>{privateState?.drawnCard ?? '—'}</span>
            </div>
            <div>
              <span className="label">Reveals done</span>
              <span>{privateState?.setupRevealsDone ?? '—'}</span>
            </div>
            <div>
              <span className="label">Current player</span>
              <span>{publicState?.currentPlayerId ?? '—'}</span>
            </div>
            <div>
              <span className="label">Discard top</span>
              <span>{publicState?.discardTop ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Actions</h3>
          {isTurnPhase && !isMyTurn && <p className="muted">Not your turn.</p>}
          <div className="stack">
            <button
              type="button"
              onClick={() =>
                playerSession?.token &&
                sendMessage({
                  type: 'set_ready',
                  payload: { token: playerSession.token, ready: true },
                })
              }
              disabled={!playerSession?.token || (isTurnPhase && !isMyTurn)}
            >
              Set ready
            </button>
            <button
              type="button"
              onClick={() =>
                playerSession?.token &&
                sendMessage({
                  type: 'set_ready',
                  payload: { token: playerSession.token, ready: false },
                })
              }
              disabled={!playerSession?.token || (isTurnPhase && !isMyTurn)}
            >
              Set not ready
            </button>
            <div className="field">
              <span>Card index (0-11)</span>
              <input
                value={indexInput}
                onChange={(event) => setIndexInput(event.target.value)}
              />
            </div>
            <div className="actions">
              {phase === 'TURN_RESOLVE' && privateState?.drawnCard !== null && (
                <button
                  type="button"
                  onClick={() =>
                    playerSession?.token &&
                    isMyTurn &&
                    setIsRevealMode(true)
                  }
                  disabled={!canDiscardAndReveal || !isMyTurn}
                >
                  {isRevealMode ? 'Choose a card to reveal' : 'Discard + Reveal'}
                </button>
              )}
              {isRevealMode && (
                <button type="button" className="button--ghost" onClick={() => setIsRevealMode(false)}>
                  Cancel reveal
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  playerSession?.token &&
                  isValidIndex &&
                  sendMessage({
                    type: 'setup_reveal',
                    payload: { token: playerSession.token, index: parsedIndex },
                  })
                }
                disabled={!playerSession?.token || !isValidIndex || (isTurnPhase && !isMyTurn)}
              >
                Reveal card
              </button>
              <button
                type="button"
                onClick={() =>
                  playerSession?.token &&
                  isValidIndex &&
                  sendMessage({
                    type: 'swap_into_grid',
                    payload: { token: playerSession.token, index: parsedIndex },
                  })
                }
                disabled={!playerSession?.token || !isValidIndex || (isTurnPhase && !isMyTurn)}
              >
                Swap into grid
              </button>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() =>
                  playerSession?.token &&
                  sendMessage({
                    type: 'draw_from_deck',
                    payload: { token: playerSession.token },
                  })
                }
                disabled={!playerSession?.token || (isTurnPhase && !isMyTurn)}
              >
                Draw from deck
              </button>
              <button
                type="button"
                onClick={() =>
                  playerSession?.token &&
                  sendMessage({
                    type: 'take_discard',
                    payload: { token: playerSession.token },
                  })
                }
                disabled={!playerSession?.token || (isTurnPhase && !isMyTurn)}
              >
                Take discard
              </button>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() =>
                  playerSession?.token &&
                  sendMessage({
                    type: 'discard_drawn',
                    payload: { token: playerSession.token },
                  })
                }
                disabled={!playerSession?.token || (isTurnPhase && !isMyTurn)}
              >
                Discard drawn card
              </button>
              <button
                type="button"
                onClick={() =>
                  playerSession?.token &&
                  sendMessage({
                    type: 'start_new_round',
                    payload: { token: playerSession.token },
                  })
                }
                disabled={!playerSession?.token || (isTurnPhase && !isMyTurn)}
              >
                Start new round
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Your grid</h3>
          {privateState?.grid ? (
            <div className="grid-cards">
              {privateState.grid.map((cell) => (
                <div
                  key={cell.i}
                  className={`grid-cards__cell ${
                    cell.isRemoved ? 'grid-cards__cell--removed' : ''
                  }`}
                  onClick={() => handleGridClick(cell.i)}
                  role={isRevealMode ? 'button' : undefined}
                  tabIndex={isRevealMode ? 0 : -1}
                >
                  <span className="grid-cards__index">{cell.i}</span>
                  <strong>
                    {cell.isRemoved
                      ? 'Removed'
                      : cell.isFaceUp
                        ? cell.value ?? '—'
                        : 'Hidden'}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No private grid yet.</p>
          )}
        </div>

        <div className="card">
          <h3>Info log</h3>
          {infoLog.length === 0 ? (
            <p className="muted">No info messages yet.</p>
          ) : (
            <ul className="list">
              {infoLog.map((info) => (
                <li key={info.id} className="list__item list__item--compact">
                  {info.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
