import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ServerMessage } from '../types/skyjo'


const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8001/ws`




type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

type UseSkyjoSocketOptions = {
  onMessage?: (message: ServerMessage) => void
}

export function useSkyjoSocket(options: UseSkyjoSocketOptions = {}) {
  const { onMessage } = options
  const onMessageRef = useRef(onMessage)
  const socketRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    const socket = new WebSocket(WS_URL)
    socketRef.current = socket
    setStatus('connecting')

    const handleOpen = () => setStatus('open')
    const handleClose = () => setStatus('closed')
    const handleError = () => setStatus('error')
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as ServerMessage
        setLastMessage(parsed)
        onMessageRef.current?.(parsed)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown message error'
        setLastError(errorMessage)
      }
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)
    socket.addEventListener('message', handleMessage)

    return () => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('close', handleClose)
      socket.removeEventListener('error', handleError)
      socket.removeEventListener('message', handleMessage)
      socket.close()
    }
  }, [])

  const sendMessage = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastError('WebSocket is not connected yet.')
      return
    }
    socket.send(JSON.stringify(message))
  }, [])

  return {
    status,
    lastMessage,
    lastError,
    sendMessage,
  }
}
