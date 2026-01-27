import { useCallback, useMemo, useState } from 'react'
import './App.css'
import { ModeSelect } from './components/ModeSelect'
import { useSkyjoSocket } from './hooks/useSkyjoSocket'
import { loadPlayerStorage, loadTableStorage, savePlayerStorage, saveTableStorage } from './lib/storage'
import type { GameMeta, GamePublicState, PlayerPrivateState, ServerMessage } from './types/skyjo'
import { PlayerView } from './views/PlayerView'
import { TableView } from './views/TableView'

type Mode = 'table' | 'player'

type PlayerSession = {
  token: string
  playerId: string
  code: string
  name: string
}

function App() {
  const mode = useMemo<Mode | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const value = params.get('mode')
    if (value === 'table' || value === 'player') {
      return value
    }
    return null
  }, [])

  const storedPlayer = loadPlayerStorage()
  const storedTable = loadTableStorage()

  const [publicState, setPublicState] = useState<GamePublicState | null>(null)
  const [privateState, setPrivateState] = useState<PlayerPrivateState | null>(null)
  const [privateMeta, setPrivateMeta] = useState<GameMeta | null>(null)
  const [playerName, setPlayerName] = useState(storedPlayer.name ?? '')
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(() => {
    if (storedPlayer.token && storedPlayer.playerId && storedPlayer.code) {
      return {
        token: storedPlayer.token,
        playerId: storedPlayer.playerId,
        code: storedPlayer.code,
        name: storedPlayer.name ?? '',
      }
    }
    return null
  })
  const [tableCode, setTableCode] = useState(storedTable.code)
  const [lastInfo, setLastInfo] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === 'game_public_state') {
        setPublicState(message.payload.game)
        return
      }
      if (message.type === 'player_private_state') {
        setPrivateState(message.payload.me)
        setPrivateMeta(message.payload.gameMeta)
        return
      }
      if (message.type === 'table_created') {
        saveTableStorage({ code: message.payload.code })
        setTableCode(message.payload.code)
        return
      }
      if (message.type === 'joined') {
        const session = {
          token: message.payload.token,
          playerId: message.payload.playerId,
          code: message.payload.code,
          name: playerName,
        }
        savePlayerStorage(session)
        setPlayerSession(session)
        return
      }
      if (message.type === 'info') {
        setLastInfo(message.payload.message)
        return
      }
      if (message.type === 'error') {
        setLastError(message.payload.message)
      }
    },
    [playerName],
  )

  const socket = useSkyjoSocket({ onMessage: handleMessage })
  const combinedError = lastError ?? socket.lastError

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Skyjo Web</p>
          <h1 className="app__title">Frontend control panel</h1>
        </div>
        <div className="app__mode">
          <span>Mode:</span>
          <strong>{mode ?? 'select'}</strong>
        </div>
      </header>
      <main className="app__main">
        {mode === 'table' && (
          <TableView
            socket={socket}
            publicState={publicState}
            tableCode={tableCode}
            lastInfo={lastInfo}
            lastError={combinedError}
            onClearTableCode={() => setTableCode(null)}
          />
        )}
        {mode === 'player' && (
          <PlayerView
            socket={socket}
            publicState={publicState}
            privateState={privateState}
            privateMeta={privateMeta}
            playerSession={playerSession}
            playerName={playerName}
            onPlayerNameChange={setPlayerName}
            lastInfo={lastInfo}
            lastError={combinedError}
            onClearPlayerSession={() => setPlayerSession(null)}
          />
        )}
        {!mode && <ModeSelect />}
      </main>
    </div>
  )
}

export default App
