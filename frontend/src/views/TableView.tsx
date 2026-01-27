import { useEffect, useMemo, useRef, useState } from 'react'
import type { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import {
  clearTableStorage,
  loadPlayerTokenForGame,
  loadTableSelection,
  saveTableSelection,
} from '../lib/storage'
import type { GamePublicState } from '../types/skyjo'
import './TableView.css'

type TableViewProps = {
  socket: ReturnType<typeof useSkyjoSocket>
  publicState: GamePublicState | null
  tableCode: string | null
  lastInfo: string | null
  lastError: string | null
  onClearTableCode: () => void
}

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

export function TableView({
  socket,
  publicState,
  tableCode,
  lastError,
  onClearTableCode,
}: TableViewProps) {
  const [selection, setSelection] = useState(() => loadTableSelection())

  // ✅ Let op: publicState is GamePublicState
  const phase = publicState?.phase ?? 'LOBBY'
  const currentPlayerId = publicState?.currentPlayerId ?? null
  const canChooseSource = phase === 'TURN_CHOOSE_SOURCE' && Boolean(currentPlayerId)
  const isLocked = selection.locked

  const previousPlayerId = useRef<string | null>(currentPlayerId)

  useEffect(() => {
    saveTableSelection(selection)
  }, [selection])

  // Sync selection between tabs/devices (storage event fires in other tabs)
  useEffect(() => {
    const handleStorage = () => {
      setSelection(loadTableSelection())
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    console.log('[TableView] phase/current/selection', {
      phase,
      currentPlayerId,
      selection,
    })
  }, [phase, currentPlayerId, selection])

  // Reset selection when:
  // - phase not in TURN_CHOOSE_SOURCE / TURN_RESOLVE
  // - OR turn changes (currentPlayerId changes)
  useEffect(() => {
    if (phase !== 'TURN_CHOOSE_SOURCE' && phase !== 'TURN_RESOLVE') {
      setSelection({ selectedSource: null, deckMode: 'swap', locked: false })
      previousPlayerId.current = currentPlayerId
      return
    }

    if (previousPlayerId.current && previousPlayerId.current !== currentPlayerId) {
      setSelection({ selectedSource: null, deckMode: 'swap', locked: false })
    }
    previousPlayerId.current = currentPlayerId
  }, [phase, currentPlayerId])

  const players = useMemo(() => publicState?.players ?? [], [publicState])
  const playerCount = Math.min(players.length, 4)
  const playerColumns = useMemo(
    () => Array.from({ length: playerCount }, (_, i) => i),
    [playerCount],
  )
  const rows = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), [])

  const currentPlayerName = useMemo(() => {
    if (!currentPlayerId) return '—'
    const match = players.find((player) => player.id === currentPlayerId)
    return match?.name ?? '—'
  }, [players, currentPlayerId])

  const deckImage = cardImageMap['Rückseite']

  const discardKey = publicState?.discardTop ?? null
  const discardImage = discardKey !== null ? cardImageMap[String(discardKey)] : deckImage

  const selectedImage = selection.selectedSource === 'discard' ? discardImage : deckImage

  const selectedSlotClassName = selection.selectedSource
    ? `table-card table-card--selected ${
        selection.selectedSource === 'deck' && selection.deckMode === 'reveal'
          ? 'table-card--reveal'
          : 'table-card--swap'
      }`
    : 'table-card table-card--slot'

  return (
    <section className="table-view">
      <div className="table-view__setup">
        <h2 className="table-view__title">Spiel setup</h2>
        <p className="table-view__code">join code: {tableCode ?? '-'}</p>
        <div className="table-view__buttons">
          <button
            className="table-view__button"
            onClick={() => {
              if (!tableCode) {
                socket.sendMessage({ type: 'create_table', payload: {} })
              }
            }}
            disabled={Boolean(tableCode)}
          >
            Neues Spiel
          </button>
          <button
            type="button"
            className="table-view__button"
            onClick={() => {
              clearTableStorage()
              onClearTableCode()
            }}
          >
            Spiel zurücksetzen
          </button>
        </div>
        {lastError && <p className="table-view__error">{lastError}</p>}
      </div>

      <div className="table-view__scoreboard">
        <table>
          <thead>
            <tr>
              <th className="scoreboard__corner" />
              {playerColumns.map((index) => (
                <th key={`header-${index}`} className="scoreboard__header">
                  P{index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`row-${row}`}>
                <th className="scoreboard__row-label">{row}</th>
                {playerColumns.map((col) => (
                  <td
                    key={`cell-${row}-${col}`}
                    className={`scoreboard__cell ${col % 2 === 1 ? 'scoreboard__cell--alt' : ''}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-view__status">{currentPlayerName} ist an der Reihe</div>

      {phase === 'LOBBY' && (
        <div className="table-view__ready">
          <h3 className="table-view__ready-title">Start game / Ready</h3>
          <ul className="table-view__ready-list">
            {players.length === 0 && <li className="table-view__ready-item">Noch keine Spieler.</li>}
            {players.map((player) => {
              const token = loadPlayerTokenForGame(tableCode, player.id)
              const hasToken = Boolean(token)
              return (
                <li key={player.id} className="table-view__ready-item">
                  <span className="table-view__ready-name">{player.name}</span>
                  <span className="table-view__ready-state">
                    {player.ready ? 'bereit' : 'nicht bereit'}
                  </span>
                  {hasToken ? (
                    <button
                      type="button"
                      className="table-view__ready-button"
                      onClick={() => {
                        if (!token || player.ready) {
                          return
                        }
                        socket.sendMessage({
                          type: 'set_ready',
                          payload: { token, ready: true },
                        })
                      }}
                      disabled={player.ready}
                    >
                      {player.ready ? 'Bereit' : 'Bereit machen'}
                    </button>
                  ) : (
                    <span className="table-view__ready-readonly">read-only</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="table-view__cards">
        <div className="table-view__debug">
          Phase: {phase} | currentPlayerId: {currentPlayerId ?? '-'} | deckCount:{' '}
          {publicState?.deckCount ?? '-'} | discardTop: {publicState?.discardTop ?? 'null'} | selection:{' '}
          {JSON.stringify(selection)}
        </div>

        {/* DECK */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && selection.selectedSource !== 'deck' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            setSelection({ selectedSource: 'deck', deckMode: 'swap', locked: true })
            console.log('[TableView] selected source deck')
          }}
          type="button"
          disabled={!canChooseSource || (isLocked && selection.selectedSource !== 'deck')}
        >
          <img className="table-card__image" src={deckImage} alt="Deck" />
        </button>

        {/* DISCARD */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && selection.selectedSource !== 'discard' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            setSelection({ selectedSource: 'discard', deckMode: 'swap', locked: true })
            console.log('[TableView] selected source discard')
          }}
          type="button"
          disabled={!canChooseSource || (isLocked && selection.selectedSource !== 'discard')}
        >
          <img className="table-card__image" src={discardImage} alt="Ablagestapel" />
        </button>

        {/* SELECTED SLOT */}
        {selection.selectedSource && (
          <button
            className={selectedSlotClassName}
            onClick={() => {
              if (selection.selectedSource !== 'deck') return
              setSelection((prev) => ({
                selectedSource: prev.selectedSource,
                deckMode: prev.deckMode === 'swap' ? 'reveal' : 'swap',
                locked: prev.locked,
              }))
              console.log('[TableView] toggled deck mode')
            }}
            type="button"
            aria-pressed={selection.deckMode === 'reveal'}
          >
            <img className="table-card__image" src={selectedImage} alt="Ausgewählte Karte" />
          </button>
        )}
      </div>
    </section>
  )
}
