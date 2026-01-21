import { useMemo, useState } from 'react'
import { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import { clearTableStorage, loadTableStorage, saveTableStorage } from '../lib/storage'
import type { GamePublicState, ServerMessage } from '../types/skyjo'
import './ViewStyles.css'

type InfoLog = {
  id: string
  message: string
}

export function TableView() {
  const stored = loadTableStorage()
  const [code, setCode] = useState(stored.code)
  const [publicState, setPublicState] = useState<GamePublicState | null>(null)
  const [infoLog, setInfoLog] = useState<InfoLog[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleMessage = (message: ServerMessage) => {
    if (message.type === 'table_created') {
      setCode(message.payload.code)
      saveTableStorage({ code: message.payload.code })
      return
    }
    if (message.type === 'game_public_state') {
      setPublicState(message.payload.game)
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

  const players = useMemo(() => publicState?.players ?? [], [publicState])

  return (
    <section className="view">
      <header className="view__header">
        <div>
          <h2>Table device</h2>
          <p>Use this screen to create a table and monitor the public state.</p>
        </div>
        <div className="status">
          <span className={`status__dot status__dot--${status}`} />
          <span>{status}</span>
        </div>
      </header>

      <div className="grid">
        <div className="card">
          <h3>Table setup</h3>
          <p className="muted">Stored join code: {code ?? '—'}</p>
          <div className="actions">
            <button onClick={() => sendMessage({ type: 'create_table', payload: {} })}>
              Create table
            </button>
            <button
              type="button"
              className="button--ghost"
              onClick={() => {
                clearTableStorage()
                setCode(null)
              }}
            >
              Clear stored code
            </button>
          </div>
          {(errorMessage || lastError) && (
            <p className="error">{errorMessage ?? lastError}</p>
          )}
        </div>

        <div className="card">
          <h3>Public game state</h3>
          <div className="state-grid">
            <div>
              <span className="label">Phase</span>
              <span>{publicState?.phase ?? '—'}</span>
            </div>
            <div>
              <span className="label">Deck count</span>
              <span>{publicState?.deckCount ?? '—'}</span>
            </div>
            <div>
              <span className="label">Discard top</span>
              <span>{publicState?.discardTop ?? '—'}</span>
            </div>
            <div>
              <span className="label">Current player</span>
              <span>{publicState?.currentPlayerId ?? '—'}</span>
            </div>
            <div>
              <span className="label">Round</span>
              <span>{publicState?.roundIndex ?? '—'}</span>
            </div>
            <div>
              <span className="label">Final round</span>
              <span>{publicState?.finalRound ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Players</h3>
          {players.length === 0 ? (
            <p className="muted">No players yet.</p>
          ) : (
            <ul className="list">
              {players.map((player) => (
                <li key={player.id} className="list__item">
                  <div>
                    <strong>{player.name}</strong>
                    <span className="muted">ID: {player.id}</span>
                  </div>
                  <div className="pill-group">
                    <span className="pill">Ready: {player.ready ? 'Yes' : 'No'}</span>
                    <span className="pill">Revealed: {player.revealedCount}</span>
                    <span className="pill">Removed: {player.removedCount}</span>
                  </div>
                </li>
              ))}
            </ul>
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