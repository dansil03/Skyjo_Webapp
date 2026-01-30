type PlayerStorage = {
  token: string | null
  playerId: string | null
  code: string | null
  name: string | null
}

type TableStorage = {
  code: string | null
}

const PLAYER_KEYS = {
  token: 'skyjo.player.token',
  playerId: 'skyjo.player.playerId',
  code: 'skyjo.player.code',
  name: 'skyjo.player.name',
}

const TABLE_KEYS = {
  code: 'skyjo.table.code',
}

type PlayerMirrorSession = {
  code: string
  playerId: string
  token: string
  name?: string
}

function playerMirrorTokenKey(code: string, playerId: string) {
  return `skyjo.players.${code}.token.${playerId}`
}

export function savePlayerMirror(session: PlayerMirrorSession) {
  const { code, playerId, token } = session
  if (!code || !playerId || !token) {
    return
  }
  window.localStorage.setItem(playerMirrorTokenKey(code, playerId), token)
}

export function loadPlayerTokenForGame(code: string | null, playerId: string): string | null {
  if (!code) {
    return null
  }
  return window.localStorage.getItem(playerMirrorTokenKey(code, playerId))
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

function saveValue(storage: Storage, key: string, value: string | null | undefined) {
  if (value === null || value === undefined) {
    storage.removeItem(key)
    return
  }
  storage.setItem(key, value)
}
