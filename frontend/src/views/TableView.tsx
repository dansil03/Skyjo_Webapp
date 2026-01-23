import { useEffect, useMemo, useRef, useState } from 'react'
import type { useSkyjoSocket } from '../hooks/useSkyjoSocket'
import { clearTableStorage } from '../lib/storage'
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

type SelectionState = {
  selectedSource: 'deck' | 'discard' | null
  deckMode: 'swap' | 'reveal'
}

const selectionStorageKey = 'skyjo.table.selection'

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

const getStoredSelection = (): SelectionState => {
  if (typeof window === 'undefined') {
    return { selectedSource: null, deckMode: 'swap' }
  }
  try {
    const stored = window.localStorage.getItem(selectionStorageKey)
    if (!stored) {
      return { selectedSource: null, deckMode: 'swap' }
    }
    const parsed = JSON.parse(stored) as SelectionState
    if (
      parsed &&
      (parsed.selectedSource === 'deck' ||
        parsed.selectedSource === 'discard' ||
        parsed.selectedSource === null) &&
      (parsed.deckMode === 'swap' || parsed.deckMode === 'reveal')
    ) {
      return { selectedSource: parsed.selectedSource, deckMode: parsed.deckMode }
    }
  } catch {
    return { selectedSource: null, deckMode: 'swap' }
  }
  return { selectedSource: null, deckMode: 'swap' }
}

export function TableView({
  socket,
  publicState,
  tableCode,
  lastError,
  onClearTableCode,
}: TableViewProps) {
  const [selection, setSelection] = useState<SelectionState>(() => getStoredSelection())

  // ✅ Let op: publicState is GamePublicState, dus currentPlayerId zit direct op publicState
  const phase = publicState?.phase ?? 'LOBBY'
  const currentPlayerId = publicState?.currentPlayerId ?? null
  const canChooseSource = phase === 'TURN_CHOOSE_SOURCE'
  const isLocked = selection.selectedSource !== null

  // ✅ init ref met juiste shape
  const previousPlayerId = useRef<string | null>(currentPlayerId)

  useEffect(() => {
    window.localStorage.setItem(selectionStorageKey, JSON.stringify(selection))
  }, [selection])

  // Reset selection wanneer:
  // - we NIET in TURN_CHOOSE_SOURCE zitten
  // - of currentPlayerId wisselt (nieuwe beurt)
  useEffect(() => {
    if (phase !== 'TURN_CHOOSE_SOURCE') {
      setSelection({ selectedSource: null, deckMode: 'swap' })
      previousPlayerId.current = currentPlayerId
      return
    }

    if (previousPlayerId.current && previousPlayerId.current !== currentPlayerId) {
      setSelection({ selectedSource: null, deckMode: 'swap' })
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
  const discardImage =
    discardKey !== null ? cardImageMap[String(discardKey)] : deckImage

  // In jouw Figma: als je deck kiest, toon je de rug in de selectie-slot (swap/reveal toggle)
  // Als je discard kiest, toon je de open kaart.
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

      <div className="table-view__cards">
        <div className="table-view__debug">
          Phase: {phase} | currentPlayerId: {currentPlayerId ?? '-'} | deckCount:{' '}
          {publicState?.deckCount ?? '-'} | discardTop:{' '}
          {publicState?.discardTop ?? 'null'}
        </div>

        {/* DECK */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && selection.selectedSource !== 'deck' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            setSelection({ selectedSource: 'deck', deckMode: 'swap' })
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
            setSelection({ selectedSource: 'discard', deckMode: 'swap' })
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
              }))
            }}
            type="button"
            aria-pressed={selection.deckMode === 'reveal'}
          >
            <img className="table-card__image" src={selectedImage} alt="Ausgewählte Karte" />
          </button>
        )}

        {isLocked && (
          <button
            className="table-view__clear"
            onClick={() => setSelection({ selectedSource: null, deckMode: 'swap' })}
            type="button"
          >
            Auswahl löschen
          </button>
        )}
      </div>
    </section>
  )
}
