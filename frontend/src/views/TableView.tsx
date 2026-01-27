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

export function TableView({
  socket,
  publicState,
  tableCode,
  lastError,
  onClearTableCode,
}: TableViewProps) {
  const [selection, setSelection] = useState(() => loadTableSelection())

  // Force rerender when player mirror updates (same-tab scenario) or selection updates from other tabs.
  const [, forceRerender] = useState(0)

  // ✅ Let op: publicState is GamePublicState
  const phase = publicState?.phase ?? 'LOBBY'
  const currentPlayerId = publicState?.currentPlayerId ?? null
  const canChooseSource = phase === 'TURN_CHOOSE_SOURCE' && Boolean(currentPlayerId)
  const isLocked = selection.locked

  const previousPlayerId = useRef<string | null>(currentPlayerId)
  const previousPhase = useRef<string>(phase)

  useEffect(() => {
    saveTableSelection(selection)
  }, [selection])

  // Sync selection between tabs/devices (storage event fires in other tabs)
  useEffect(() => {
    const handleStorage = () => {
      setSelection(loadTableSelection())
      // NOTE: player-mirror changes are also in localStorage, so rerender helps reflect buttons.
      forceRerender((x) => x + 1)
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Same-tab updates: App dispatches this after saving mirror.
  useEffect(() => {
    const handleMirror = () => forceRerender((x) => x + 1)
    window.addEventListener('skyjo-player-mirror', handleMirror as EventListener)
    return () => window.removeEventListener('skyjo-player-mirror', handleMirror as EventListener)
  }, [])

  useEffect(() => {
    console.log('[TableView] phase/selection', {
      phase,
      discardTop: publicState?.discardTop ?? null,
      selectedSource: selection.selectedSource,
      deckMode: selection.deckMode,
      locked: selection.locked,
    })
  }, [
    phase,
    publicState?.discardTop,
    selection.selectedSource,
    selection.deckMode,
    selection.locked,
  ])

  // Reset selection when:
  // - phase not in TURN_CHOOSE_SOURCE / TURN_RESOLVE
  // - OR turn changes (currentPlayerId changes)
  useEffect(() => {
    if (phase !== 'TURN_CHOOSE_SOURCE' && phase !== 'TURN_RESOLVE') {
      // Root cause: stale localStorage selection can leak into non-turn phases, showing a third slot.
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
      // Root cause: entering TURN_CHOOSE_SOURCE from setup left a previous selection visible.
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

  const deckImage = cardImageMap['Rückseite']

  const discardKey = publicState?.discardTop ?? null
  const discardImage = discardKey !== null ? cardImageMap[String(discardKey)] : deckImage

  const selectedImage = (() => {
    if (selection.selectedSource === 'discard') {
      if (selection.selectedValue !== null) {
        const imageKey = String(selection.selectedValue)
        const image = cardImageMap[imageKey]
        if (!image) {
          console.debug('[TableView] missing card image for selection', {
            missingKey: imageKey,
            availableKeys: Object.keys(cardImageMap),
          })
        }
        return image ?? deckImage
      }
      return deckImage
    }

    if (selection.selectedSource === 'deck') {
      if (publicState?.tableDrawnCard !== null) {
        const imageKey = String(publicState.tableDrawnCard)
        const image = cardImageMap[imageKey]
        if (!image) {
          console.debug('[TableView] missing card image for tableDrawnCard', {
            missingKey: imageKey,
            availableKeys: Object.keys(cardImageMap),
          })
        }
        return image ?? deckImage
      }
      return deckImage
    }

    return deckImage
  })()

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
              const tokenForPlayer =
                tableCode ? loadPlayerTokenForGame(tableCode, player.id) : null
              const hasToken = Boolean(tokenForPlayer)

              // Debug to confirm mirror reading:
              console.debug('[TableView] tokenForPlayer', {
                tableCode,
                playerId: player.id,
                hasToken,
              })

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
        <div className="table-view__debug">
          Phase: {phase} | currentPlayerId: {currentPlayerId ?? '-'} | deckCount:{' '}
          {publicState?.deckCount ?? '-'} | discardTop: {publicState?.discardTop ?? 'null'} |
          selection: {JSON.stringify(selection)}
        </div>

        {/* DECK */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && selection.selectedSource !== 'deck' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            setSelection({
              selectedSource: 'deck',
              deckMode: 'swap',
              locked: true,
              selectedValue: null,
            })
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
            setSelection({
              selectedSource: 'discard',
              deckMode: 'swap',
              locked: true,
              selectedValue: publicState?.discardTop ?? null,
            })
            console.log('[TableView] selected source discard')
          }}
          type="button"
          disabled={!canChooseSource || (isLocked && selection.selectedSource !== 'discard')}
        >
          {/* Root cause: discard image must always come from publicState.discardTop (no cached state). */}
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
                selectedValue: prev.selectedValue,
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
