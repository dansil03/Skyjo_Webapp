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

export function loadPlayerStorage(): PlayerStorage {
  return {
    token: window.localStorage.getItem(PLAYER_KEYS.token),
    playerId: window.localStorage.getItem(PLAYER_KEYS.playerId),
    code: window.localStorage.getItem(PLAYER_KEYS.code),
    name: window.localStorage.getItem(PLAYER_KEYS.name),
  }
}

export function savePlayerStorage(values: Partial<PlayerStorage>) {
  if (values.token !== undefined) {
    saveValue(PLAYER_KEYS.token, values.token)
  }
  if (values.playerId !== undefined) {
    saveValue(PLAYER_KEYS.playerId, values.playerId)
  }
  if (values.code !== undefined) {
    saveValue(PLAYER_KEYS.code, values.code)
  }
  if (values.name !== undefined) {
    saveValue(PLAYER_KEYS.name, values.name)
  }
}

export function clearPlayerStorage() {
  Object.values(PLAYER_KEYS).forEach((key) => window.localStorage.removeItem(key))
}

export function loadTableStorage(): TableStorage {
  return {
    code: window.localStorage.getItem(TABLE_KEYS.code),
  }
}

export function saveTableStorage(values: Partial<TableStorage>) {
  if (values.code !== undefined) {
    saveValue(TABLE_KEYS.code, values.code)
  }
}

export function clearTableStorage() {
  Object.values(TABLE_KEYS).forEach((key) => window.localStorage.removeItem(key))
}

function saveValue(key: string, value: string | null | undefined) {
  if (value === null || value === undefined) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, value)
}