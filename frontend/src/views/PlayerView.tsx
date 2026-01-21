import { useMemo, useState } from 'react'
import { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import {
  clearPlayerStorage,
  loadPlayerStorage,
  savePlayerStorage,
} from '../lib/storage'
import type {
  GamePublicState,
  GameMeta,
  PlayerPrivateState,
  ServerMessage,
} from '../types/skyjo'
import './ViewStyles.css'

type InfoLog = {
  id: string
  message: string
}

const GRID_SIZE = 12

export function PlayerView() {
  const stored = loadPlayerStorage()
  const [code, setCode] = useState(stored.code ?? '')
  const [name, setName] = useState(stored.name ?? '')
  const [token, setToken] = useState(stored.token)
  const [playerId, setPlayerId] = useState(stored.playerId)
  const [publicState, setPublicState] = useState<GamePublicState | null>(null)
  const [privateState, setPrivateState] = useState<PlayerPrivateState | null>(null)
  const [gameMeta, setGameMeta] = useState<GameMeta | null>(null)
  const [infoLog, setInfoLog] = useState<InfoLog[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [indexInput, setIndexInput] = useState('0')

  const handleMessage = (message: ServerMessage) => {
    if (message.type === 'joined') {
      setToken(message.payload.token)
      setPlayerId(message.payload.playerId)
      savePlayerStorage({
        token: message.payload.token,
        playerId: message.payload.playerId,
        code: message.payload.code,
        name,
      })
      return
    }
    if (message.type === 'game_public_state') {
      setPublicState(message.payload.game)
      return
    }
    if (message.type === 'player_private_state') {
      setPrivateState(message.payload.me)
      setGameMeta(message.payload.gameMeta)
      return
    }
    if (message.type === 'info') {
      setInfoLog((prev) => [
        { id: crypto.randomUUID(), message: message.payload.message },
        ...prev,
      ])
      return
    }
    if (message.type === 'error') {
      setErrorMessage(message.payload.message)
    }
  }

  const { status, sendMessage, lastError } = useSkyjoSocket({
    onMessage: handleMessage,
  })

  const isMyTurn = useMemo(() => {
    if (!publicState?.currentPlayerId || !playerId) {
      return false
    }
    return publicState.currentPlayerId === playerId
  }, [publicState?.currentPlayerId, playerId])

  const phase = publicState?.phase ?? gameMeta?.phase

  const parsedIndex = Number(indexInput)
  const isValidIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < GRID_SIZE

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
          {token ? (
            <div className="stack">
              <p className="muted">Joined as {name || 'Player'}.</p>
              <div className="pill-group">
                <span className="pill">Code: {stored.code ?? code}</span>
                <span className="pill">Player ID: {playerId}</span>
              </div>
              <button
                type="button"
                className="button--ghost"
                onClick={() => {
                  clearPlayerStorage()
                  setToken(null)
                  setPlayerId(null)
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
                sendMessage({ type: 'join_game', payload: { code, name } })
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
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                />
              </label>
              <button type="submit">Join table</button>
            </form>
          )}
          {(errorMessage || lastError) && (
            <p className="error">{errorMessage ?? lastError}</p>
          )}
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
          <div className="stack">
            <button
              type="button"
              onClick={() =>
                token &&
                sendMessage({ type: 'set_ready', payload: { token, ready: true } })
              }
              disabled={!token}
            >
              Set ready
            </button>
            <button
              type="button"
              onClick={() =>
                token &&
                sendMessage({ type: 'set_ready', payload: { token, ready: false } })
              }
              disabled={!token}
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
              <button
                type="button"
                onClick={() =>
                  token &&
                  isValidIndex &&
                  sendMessage({
                    type: 'setup_reveal',
                    payload: { token, index: parsedIndex },
                  })
                }
                disabled={!token || !isValidIndex}
              >
                Reveal card
              </button>
              <button
                type="button"
                onClick={() =>
                  token &&
                  isValidIndex &&
                  sendMessage({
                    type: 'swap_into_grid',
                    payload: { token, index: parsedIndex },
                  })
                }
                disabled={!token || !isValidIndex}
              >
                Swap into grid
              </button>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() => token && sendMessage({ type: 'draw_from_deck', payload: { token } })}
                disabled={!token}
              >
                Draw from deck
              </button>
              <button
                type="button"
                onClick={() => token && sendMessage({ type: 'take_discard', payload: { token } })}
                disabled={!token}
              >
                Take discard
              </button>
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={() => token && sendMessage({ type: 'discard_drawn', payload: { token } })}
                disabled={!token}
              >
                Discard drawn card
              </button>
              <button
                type="button"
                onClick={() => token && sendMessage({ type: 'start_new_round', payload: { token } })}
                disabled={!token}
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