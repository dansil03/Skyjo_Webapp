type PlayerStorage = {
  token: string | null
  playerId: string | null
  code: string | null
  name: string | null
}

type TableStorage = {
  code: string | null
}

export type TableSelectionState = {
  selectedSource: 'deck' | 'discard' | null
  deckMode: 'swap' | 'reveal'
  locked: boolean
}

const PLAYER_KEYS = {
  token: 'skyjo.player.token',
  playerId: 'skyjo.player.playerId',
  code: 'skyjo.player.code',
  name: 'skyjo.player.name',
}

const TABLE_KEYS = {
  code: 'skyjo.table.code',
  selection: 'skyjo.table.selection',
}

// Player session is stored per-tab in sessionStorage so multiple player tabs can coexist.
export function loadPlayerStorage(): PlayerStorage {
  return {
    token: window.sessionStorage.getItem(PLAYER_KEYS.token),
    playerId: window.sessionStorage.getItem(PLAYER_KEYS.playerId),
    code: window.sessionStorage.getItem(PLAYER_KEYS.code),
    name: window.sessionStorage.getItem(PLAYER_KEYS.name),
  }
}

export function savePlayerStorage(values: Partial<PlayerStorage>) {
  if (values.token !== undefined) {
    saveValue(window.sessionStorage, PLAYER_KEYS.token, values.token)
  }
  if (values.playerId !== undefined) {
    saveValue(window.sessionStorage, PLAYER_KEYS.playerId, values.playerId)
  }
  if (values.code !== undefined) {
    saveValue(window.sessionStorage, PLAYER_KEYS.code, values.code)
  }
  if (values.name !== undefined) {
    saveValue(window.sessionStorage, PLAYER_KEYS.name, values.name)
  }
}

export function clearPlayerStorage() {
  Object.values(PLAYER_KEYS).forEach((key) => window.sessionStorage.removeItem(key))
}

export function loadTableStorage(): TableStorage {
  return {
    code: window.localStorage.getItem(TABLE_KEYS.code),
  }
}

export function saveTableStorage(values: Partial<TableStorage>) {
  if (values.code !== undefined) {
    saveValue(window.localStorage, TABLE_KEYS.code, values.code)
  }
}

export function clearTableStorage() {
  Object.values(TABLE_KEYS).forEach((key) => window.localStorage.removeItem(key))
}

export function loadTableSelection(): TableSelectionState {
  if (typeof window === 'undefined') {
    return { selectedSource: null, deckMode: 'swap', locked: false }
  }
  try {
    const stored = window.localStorage.getItem(TABLE_KEYS.selection)
    if (!stored) {
      return { selectedSource: null, deckMode: 'swap', locked: false }
    }
    const parsed = JSON.parse(stored) as TableSelectionState
    if (
      parsed &&
      (parsed.selectedSource === 'deck' ||
        parsed.selectedSource === 'discard' ||
        parsed.selectedSource === null) &&
      (parsed.deckMode === 'swap' || parsed.deckMode === 'reveal') &&
      typeof parsed.locked === 'boolean'
    ) {
      return {
        selectedSource: parsed.selectedSource,
        deckMode: parsed.deckMode,
        locked: parsed.locked,
      }
    }
  } catch {
    return { selectedSource: null, deckMode: 'swap', locked: false }
  }
  return { selectedSource: null, deckMode: 'swap', locked: false }
}

export function saveTableSelection(selection: TableSelectionState) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(TABLE_KEYS.selection, JSON.stringify(selection))
}

function saveValue(storage: Storage, key: string, value: string | null | undefined) {
  if (value === null || value === undefined) {
    storage.removeItem(key)
    return
  }
  storage.setItem(key, value)
}
