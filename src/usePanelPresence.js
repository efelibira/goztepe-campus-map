import { useEffect, useState } from 'react'

// Keep the last content mounted briefly so exit animations can finish.
export function usePanelPresence(value, exitMs, enabled = true) {
  const [presented, setPresented] = useState(value)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (value) {
      setPresented(value)
      setExiting(false)
      return
    }

    if (!enabled) {
      setPresented(null)
      setExiting(false)
      return
    }

    if (!presented) return
    setExiting(true)
    const timer = window.setTimeout(() => {
      setPresented(null)
      setExiting(false)
    }, exitMs)
    return () => window.clearTimeout(timer)
  }, [value, enabled, exitMs, presented])

  return { presented, exiting }
}
