import { useEffect, useMemo, useRef, useState } from 'react'
import type { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import {
  clearTableStorage,
  loadTableSelection,
  loadPlayerTokenForGame,
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

type SelectionWithValue = ReturnType<typeof loadTableSelection> & {
  selectedValue?: number | null
}

export function TableView({
  socket,
  publicState,
  tableCode,
  lastError,
  onClearTableCode,
}: TableViewProps) {
  const [selection, setSelection] = useState<SelectionWithValue>(() => loadTableSelection() as any)

  // Force rerender when player mirror updates (same-tab scenario) or selection updates from other tabs.
  const [, forceRerender] = useState(0)

  const phase = publicState?.phase ?? 'LOBBY'
  const currentPlayerId = publicState?.currentPlayerId ?? null
  const canChooseSource = phase === 'TURN_CHOOSE_SOURCE' && Boolean(currentPlayerId)
  const isLocked = selection.locked

  const previousPlayerId = useRef<string | null>(currentPlayerId)
  const previousPhase = useRef<string>(phase)

  useEffect(() => {
    saveTableSelection(selection as any)
  }, [selection])

  useEffect(() => {
    const handleStorage = () => {
      setSelection(loadTableSelection() as any)
      forceRerender((x) => x + 1)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(() => {
    const handleMirror = () => forceRerender((x) => x + 1)
    window.addEventListener('skyjo-player-mirror', handleMirror as EventListener)
    return () => window.removeEventListener('skyjo-player-mirror', handleMirror as EventListener)
  }, [])

  // Reset selection on phase changes / turn changes
  useEffect(() => {
    if (phase !== 'TURN_CHOOSE_SOURCE' && phase !== 'TURN_RESOLVE') {
      setSelection({ selectedSource: null, deckMode: 'swap', locked: false, selectedValue: null })
      previousPlayerId.current = currentPlayerId
      previousPhase.current = phase
      return
    }

    if (
      phase === 'TURN_CHOOSE_SOURCE' &&
      previousPhase.current !== 'TURN_CHOOSE_SOURCE' &&
      previousPhase.current !== 'TURN_RESOLVE'
    ) {
      setSelection({ selectedSource: null, deckMode: 'swap', locked: false, selectedValue: null })
    }

    if (previousPlayerId.current && previousPlayerId.current !== currentPlayerId) {
      setSelection({ selectedSource: null, deckMode: 'swap', locked: false, selectedValue: null })
    }

    previousPlayerId.current = currentPlayerId
    previousPhase.current = phase
  }, [phase, currentPlayerId])

  const players = useMemo(() => publicState?.players ?? [], [publicState])
  const playersToShow = useMemo(() => players.slice(0, 4), [players])
  const rows = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), [])

  const currentPlayerName = useMemo(() => {
    if (!currentPlayerId) return '—'
    const match = players.find((player) => player.id === currentPlayerId)
    return match?.name ?? '—'
  }, [players, currentPlayerId])

  const deckBackImage = cardImageMap['Rückseite']

  const discardTop = publicState?.discardTop ?? null
  const discardImage = discardTop !== null ? cardImageMap[String(discardTop)] : deckBackImage

  const tableDrawnCard = publicState?.tableDrawnCard ?? null
  const deckPreviewImage = useMemo(() => {
    if (tableDrawnCard === null) return deckBackImage
    return cardImageMap[String(tableDrawnCard)] ?? deckBackImage
  }, [tableDrawnCard, deckBackImage])

  // ✅ KEY FIX:
  // if we have a cached selectedValue (e.g. discard we picked), always show that in the selected slot.
  const selectedImage = useMemo(() => {
    if (selection.selectedValue !== undefined && selection.selectedValue !== null) {
      return cardImageMap[String(selection.selectedValue)] ?? deckBackImage
    }
    if (selection.selectedSource === 'discard') return discardImage
    if (selection.selectedSource === 'deck') return deckPreviewImage
    return deckBackImage
  }, [
    selection.selectedValue,
    selection.selectedSource,
    discardImage,
    deckPreviewImage,
    deckBackImage,
  ])

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
              if (!tableCode) socket.sendMessage({ type: 'create_table', payload: {} })
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
              {playersToShow.map((player) => (
                <th key={`header-${player.id}`} className="scoreboard__header">
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`row-${row}`}>
                <th className="scoreboard__row-label">{row}</th>
                {playersToShow.map((player, col) => (
                  <td
                    key={`cell-${row}-${player.id}`}
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
              const tokenForPlayer = tableCode ? loadPlayerTokenForGame(tableCode, player.id) : null
              const hasToken = Boolean(tokenForPlayer)

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
                        if (!tokenForPlayer || player.ready) return
                        socket.sendMessage({
                          type: 'set_ready',
                          payload: { token: tokenForPlayer, ready: true },
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
        {/* DECK */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && selection.selectedSource !== 'deck' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            setSelection({ selectedSource: 'deck', deckMode: 'swap', locked: true, selectedValue: null })
          }}
          type="button"
          disabled={!canChooseSource || (isLocked && selection.selectedSource !== 'deck')}
        >
          <img className="table-card__image" src={deckBackImage} alt="Deck" />
        </button>

        {/* DISCARD */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && selection.selectedSource !== 'discard' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            // ✅ cache the discardTop we are taking, so UI stays correct after discardTop changes
            setSelection({
              selectedSource: 'discard',
              deckMode: 'swap',
              locked: true,
              selectedValue: discardTop,
            })
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
                ...prev,
                deckMode: prev.deckMode === 'swap' ? 'reveal' : 'swap',
              }))
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
