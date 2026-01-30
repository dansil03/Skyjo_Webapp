import { useMemo } from 'react'
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
  const phase = publicState?.phase ?? 'LOBBY'
  const currentPlayerId = publicState?.currentPlayerId ?? null
  const canChooseSource = phase === 'TURN_CHOOSE_SOURCE' && Boolean(currentPlayerId)
  const tableSelectedSource = publicState?.tableSelectedSource ?? null
  const tableDeckMode = publicState?.tableDeckMode ?? 'swap'
  const isLocked = tableSelectedSource !== null

  const players = useMemo(() => publicState?.players ?? [], [publicState])
  const playersToShow = useMemo(() => players.slice(0, 4), [players])
  const rows = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), [])
  const totalScores = publicState?.totalScores ?? {}
  const roundHistory = publicState?.roundHistory ?? []
  const lastCompletedRoundIndex = roundHistory.length

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

  const shouldShowSelectedSlot = Boolean(tableSelectedSource) || tableDrawnCard !== null

  const selectedImage = useMemo(() => {
    if (tableSelectedSource === 'discard') return discardImage
    if (tableSelectedSource === 'deck' || tableDrawnCard !== null) return deckPreviewImage
    return deckBackImage
  }, [tableSelectedSource, tableDrawnCard, discardImage, deckPreviewImage, deckBackImage])

  const selectedSlotClassName = tableSelectedSource
    ? `table-card table-card--selected ${
        tableSelectedSource === 'deck' && tableDeckMode === 'reveal'
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
            {rows.map((row) => {
              const scoresForRow = roundHistory[row - 1] ?? null
              const isRoundScoreRow = row === lastCompletedRoundIndex
              return (
                <tr
                  key={`row-${row}`}
                  className={isRoundScoreRow ? 'scoreboard__row--roundscore' : ''}
                >
                  <th className="scoreboard__row-label">{row}</th>
                  {playersToShow.map((player, col) => (
                    <td
                      key={`cell-${row}-${player.id}`}
                      className={`scoreboard__cell ${col % 2 === 1 ? 'scoreboard__cell--alt' : ''} ${
                        isRoundScoreRow ? 'scoreboard__cell--roundscore' : ''
                      }`}
                    >
                      {scoresForRow ? scoresForRow[player.id] ?? '' : ''}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr>
              <th className="scoreboard__row-label">Total</th>
              {playersToShow.map((player, col) => (
                <td
                  key={`total-${player.id}`}
                  className={`scoreboard__cell ${col % 2 === 1 ? 'scoreboard__cell--alt' : ''}`}
                >
                  {totalScores[player.id] ?? 0}
                </td>
              ))}
            </tr>
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
              return (
                <li key={player.id} className="table-view__ready-item">
                  <span className="table-view__ready-name">{player.name}</span>
                  <span className="table-view__ready-state">
                    {player.ready ? 'bereit' : 'nicht bereit'}
                  </span>
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
          } ${isLocked && tableSelectedSource !== 'deck' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            socket.sendMessage({
              type: 'table_set_selection',
              payload: { source: 'deck' },
            })
          }}
          type="button"
          disabled={!canChooseSource || (isLocked && tableSelectedSource !== 'deck')}
        >
          <img className="table-card__image" src={deckBackImage} alt="Deck" />
        </button>

        {/* DISCARD */}
        <button
          className={`table-card table-card--pile ${
            !canChooseSource ? 'table-card--disabled' : ''
          } ${isLocked && tableSelectedSource !== 'discard' ? 'table-card--locked' : ''}`}
          onClick={() => {
            if (!canChooseSource || isLocked) return
            socket.sendMessage({
              type: 'table_set_selection',
              payload: { source: 'discard' },
            })
          }}
          type="button"
          disabled={!canChooseSource || (isLocked && tableSelectedSource !== 'discard')}
        >
          <img className="table-card__image" src={discardImage} alt="Ablagestapel" />
        </button>

        {/* SELECTED SLOT */}
        {shouldShowSelectedSlot && (
          <button
            className={selectedSlotClassName}
            onClick={() => {
              if (tableSelectedSource !== 'deck') return
              socket.sendMessage({
                type: 'table_set_deck_mode',
                payload: { mode: tableDeckMode === 'swap' ? 'reveal' : 'swap' },
              })
            }}
            type="button"
            aria-pressed={tableDeckMode === 'reveal'}
          >
            <img className="table-card__image" src={selectedImage} alt="Ausgewählte Karte" />
          </button>
        )}
      </div>
    </section>
  )
}
