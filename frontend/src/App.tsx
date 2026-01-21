import { useMemo } from 'react'
import './App.css'
import { ModeSelect } from './components/ModeSelect'
import { PlayerView } from './views/PlayerView'
import { TableView } from './views/TableView'

type Mode = 'table' | 'player'

function App() {
  const mode = useMemo<Mode | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const value = params.get('mode')
    if (value === 'table' || value === 'player') {
      return value
    }
    return null
  }, [])

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
        {mode === 'table' && <TableView />}
        {mode === 'player' && <PlayerView />}
        {!mode && <ModeSelect />}
      </main>
    </div>
  )
}
export default App