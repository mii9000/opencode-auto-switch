export interface Witness {
  /** Records a session as TUI-witnessed; returns true only when the set grew. */
  add(sessionID: string): boolean
  snapshot(): string[]
  has(sessionID: string): boolean
  /** Registers a change callback; returns an unsubscribe function. */
  onChange(cb: () => void): () => void
}

export function createWitness(): Witness {
  const ids = new Set<string>()
  const listeners = new Set<() => void>()
  return {
    add(sessionID: string): boolean {
      const before = ids.size
      ids.add(sessionID)
      if (ids.size === before) return false
      for (const listener of listeners) listener()
      return true
    },
    has(sessionID: string): boolean {
      return ids.has(sessionID)
    },
    snapshot(): string[] {
      return [...ids]
    },
    onChange(cb: () => void): () => void {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}
