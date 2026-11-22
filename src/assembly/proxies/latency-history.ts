type HistoryEntry = { time: string; delay: number }
type Node = {
  now?: string
  all?: string[] | null
  history?: HistoryEntry[]
  extra?: Record<string, { history: HistoryEntry[] }>
}

// A group's history is always resolved through its current selection. Group
// copies can become stale between a selection change and the next poll.
export const selectedLeafName = (nodes: Record<string, Node>, name: string): string | undefined => {
  const seen = new Set<string>()
  while (name && !seen.has(name)) {
    seen.add(name)
    const node = nodes[name]
    if (!node) return undefined
    if (node.all === undefined) return name
    if (!node.now || node.now === name || !node.all?.includes(node.now)) return undefined
    name = node.now
  }
  return undefined
}

export const scopedHistory = (nodes: Record<string, Node>, name: string, url: string) => {
  const leaf = selectedLeafName(nodes, name)
  if (!leaf) return undefined
  return nodes[leaf]?.extra?.[url]?.history
}
