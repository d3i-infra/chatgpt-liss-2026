import { ConversationMessage, SearchResultGroup } from '../types'

// The export splits some assistant answers into several messages, each
// replying to the one before (e.g. gpt-6: a lead-in, empty tool steps, the
// answer itself), which ChatGPT shows as one reply. Groups such runs so they
// render as one bubble. Only parts in the same state (removed, hidden) are
// grouped, and never a message shown in a box of its own (`ownBox`, e.g.
// thoughts); everything else stays a group of one.
export function groupAnswerParts (messages: ConversationMessage[], ownBox: (msg: ConversationMessage) => boolean): ConversationMessage[][] {
  const groups: ConversationMessage[][] = []
  const standsAlone = (msg: ConversationMessage): boolean => msg.role === 'user' || ownBox(msg)
  for (const msg of messages) {
    const group = groups[groups.length - 1]
    const previous = group?.[group.length - 1]
    const continues = previous != null && !standsAlone(previous) && !standsAlone(msg) &&
      previous.role === msg.role &&
      msg.reactionTo != null && msg.reactionTo === previous.messageId &&
      (msg.removed ?? false) === (previous.removed ?? false) &&
      (msg.hidden ?? false) === (previous.hidden ?? false)
    if (continues) group.push(msg)
    else groups.push([msg])
  }
  return groups
}

// An answer's search results: each part stores those gathered so far, so
// the parts' lists overlap; merged here without repeating a page.
export function answerSources (parts: ConversationMessage[]): SearchResultGroup[] | undefined {
  if (parts.every(part => part.sources == null)) return undefined
  const seen = new Set<string>()
  const groups: SearchResultGroup[] = []
  for (const part of parts) {
    for (const group of part.sources ?? []) {
      const entries = (group.entries ?? group.items ?? []).filter(entry => {
        const key = entry.url ?? JSON.stringify(entry)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (entries.length > 0) groups.push({ ...group, entries, items: undefined })
    }
  }
  return groups
}
