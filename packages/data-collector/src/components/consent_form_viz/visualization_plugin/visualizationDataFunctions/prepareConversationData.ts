import { ConversationVisualization, ConversationVisualizationData, Conversation, ConversationMessage, ContentReference, SearchResultGroup, Table } from '../types'

export async function prepareConversationData (
  table: Table,
  visualization: ConversationVisualization
): Promise<ConversationVisualizationData> {
  const heads = table.head.cells
  const roleIdx = heads.indexOf(visualization.roleColumn)
  const messageIdx = heads.indexOf(visualization.messageColumn)
  const modelIdx = visualization.modelColumn !== undefined ? heads.indexOf(visualization.modelColumn) : -1
  const timestampIdx = visualization.timestampColumn !== undefined ? heads.indexOf(visualization.timestampColumn) : -1
  const titleIdx = visualization.titleColumn !== undefined ? heads.indexOf(visualization.titleColumn) : -1
  const referencesIdx = visualization.referencesColumn !== undefined ? heads.indexOf(visualization.referencesColumn) : -1
  const sourcesIdx = visualization.sourcesColumn !== undefined ? heads.indexOf(visualization.sourcesColumn) : -1
  const idIdx = visualization.idColumn !== undefined ? heads.indexOf(visualization.idColumn) : -1
  const reactionToIdx = visualization.reactionToColumn !== undefined ? heads.indexOf(visualization.reactionToColumn) : -1
  const hiddenIdx = visualization.hiddenColumn !== undefined ? heads.indexOf(visualization.hiddenColumn) : -1
  const contentTypeIdx = visualization.contentTypeColumn !== undefined ? heads.indexOf(visualization.contentTypeColumn) : -1

  const conversationMap = new Map<string, Conversation>()

  // Build from the pristine, pre-deletion rows when available, so that a
  // message deleted from the donated table (removed from `body`) still shows
  // up here as a removed-placeholder the user can restore, rather than
  // vanishing. A row present in originalBody but no longer in `body` is such a
  // deleted message; the ones only ever in `body` (no originalBody provided)
  // are all treated as present. Whole rows the user deleted otherwise (e.g. an
  // entire conversation) fall out below, once the conversation has no
  // non-removed messages left.
  const sourceRows = table.originalBody?.rows ?? table.body.rows
  const presentIds = new Set(table.body.rows.map(row => row.id))

  for (const row of sourceRows) {
    const removed = !presentIds.has(row.id)
    const title = titleIdx >= 0 ? (row.cells[titleIdx] ?? '') : ''
    const role = roleIdx >= 0 ? (row.cells[roleIdx] ?? '') : ''
    const message = messageIdx >= 0 ? (row.cells[messageIdx] ?? '') : ''
    const model = modelIdx >= 0 ? row.cells[modelIdx] : undefined
    const timestamp = timestampIdx >= 0 ? row.cells[timestampIdx] : undefined
    const references = referencesIdx >= 0 ? parseReferences(row.cells[referencesIdx]) : undefined
    const sources = sourcesIdx >= 0 ? parseSources(row.cells[sourcesIdx]) : undefined
    const messageId = idIdx >= 0 ? row.cells[idIdx] : undefined
    const reactionTo = reactionToIdx >= 0 ? row.cells[reactionToIdx] : undefined
    const hidden = hiddenIdx >= 0 && isTrue(row.cells[hiddenIdx])
    const contentType = contentTypeIdx >= 0 ? row.cells[contentTypeIdx] : undefined

    const msg: ConversationMessage = { id: row.id, role, message, model, timestamp, references, sources, messageId, reactionTo, removed, hidden, contentType }

    if (!conversationMap.has(title)) {
      conversationMap.set(title, { title, rowIds: [], messages: [] })
    }
    const conv = conversationMap.get(title)!
    conv.rowIds.push(row.id)
    conv.messages.push(msg)
  }

  // Order messages within each conversation. Preferably by walking the
  // reply chain (messageId/reactionTo), which keeps removed-placeholder
  // messages in their original position. Falls back to a timestamp sort when
  // those columns aren't configured.
  const conversations: Conversation[] = Array.from(conversationMap.values())
    // A conversation whose every message is removed was deleted wholesale (as
    // opposed to having individual messages removed); drop it entirely rather
    // than showing a conversation made up of nothing but placeholders.
    .filter(conv => conv.messages.some(msg => !(msg.removed ?? false)))
    .map(conv => {
    if (idIdx >= 0 && reactionToIdx >= 0) {
      conv.messages = orderByReactionChain(conv.messages)
    } else if (timestampIdx >= 0) {
      conv.messages.sort(compareByTimestamp)
    }
    conv.date = conv.messages
      .map(m => m.timestamp)
      .filter((t): t is string => t != null && t !== '')
      .sort()[0]
    return conv
  })

  // Sort conversations by their earliest message date
  conversations.sort((a, b) => {
    if (a.date == null) return -1
    if (b.date == null) return 1
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  })

  return { type: 'chat_conversation', conversations, hasSources: sourcesIdx >= 0 }
}

function compareByTimestamp (a: ConversationMessage, b: ConversationMessage): number {
  if (a.timestamp == null) return -1
  if (b.timestamp == null) return 1
  return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
}

// A hidden-column cell arrives as the DataFrame's own boolean, or as its
// string form when the table was round-tripped through text.
function isTrue (cell: unknown): boolean {
  return cell === true || cell === 'True' || cell === 'true'
}

// Reconstructs conversation order by following the messageId/reactionTo reply
// chain, rather than sorting by timestamp. A message whose reactionTo isn't
// the messageId of another message in this conversation (e.g. it points at
// the synthetic "client-created-root", or references are absent) is treated
// as a root. Any message the traversal can't reach (malformed or cyclic data)
// is appended at the end so nothing silently disappears.
//
// Sibling branches - several replies to the same message, e.g. a regenerated
// reply, a reply to an edited prompt, or the two replies ChatGPT offers to
// compare - stay together right under their parent: first the branch the
// conversation continues on, then each other branch with everything that
// followed on it, and only then the continuation. A plain depth-first walk
// would instead put the whole rest of the conversation between two siblings
// whenever the continuing branch happens to sort first. The continuing
// branch is the one not marked hidden; without hidden flags (or among hidden
// branches), the one with the most messages below it.
function orderByReactionChain (messages: ConversationMessage[]): ConversationMessage[] {
  const byMessageId = new Map<string, ConversationMessage>()
  for (const msg of messages) {
    if (msg.messageId != null) byMessageId.set(msg.messageId, msg)
  }

  const childrenOf = new Map<string, ConversationMessage[]>()
  const roots: ConversationMessage[] = []

  for (const msg of messages) {
    const parentId = msg.reactionTo
    if (parentId != null && byMessageId.has(parentId)) {
      const siblings = childrenOf.get(parentId) ?? []
      siblings.push(msg)
      childrenOf.set(parentId, siblings)
    } else {
      roots.push(msg)
    }
  }
  roots.sort(compareByTimestamp)
  for (const siblings of childrenOf.values()) siblings.sort(compareByTimestamp)

  // Label sibling branches (e.g. regenerated assistant replies to the same
  // parent turn) with their position, so the message list can show
  // "Version i of N" instead of silently flattening alternates into what
  // otherwise looks like a linear sequence of turns.
  for (const siblings of childrenOf.values()) {
    if (siblings.length <= 1) continue
    siblings.forEach((msg, i) => {
      msg.branchIndex = i + 1
      msg.branchCount = siblings.length
    })
  }

  const childrenOfMsg = (msg: ConversationMessage): ConversationMessage[] => childrenOf.get(msg.messageId ?? '') ?? []

  const sizes = new Map<ConversationMessage, number>()
  const subtreeSize = (msg: ConversationMessage): number => {
    const known = sizes.get(msg)
    if (known != null) return known
    // Provisional entry, so a cycle in malformed data can't recurse forever.
    sizes.set(msg, 1)
    const size = childrenOfMsg(msg).reduce((sum, child) => sum + subtreeSize(child), 1)
    sizes.set(msg, size)
    return size
  }

  // Ties go to the earliest sibling (the list is sorted by timestamp).
  const continuingBranch = (siblings: ConversationMessage[]): ConversationMessage => {
    const shown = siblings.filter(msg => !(msg.hidden ?? false))
    const candidates = shown.length > 0 ? shown : siblings
    return candidates.reduce((best, msg) => subtreeSize(msg) > subtreeSize(best) ? msg : best)
  }

  const ordered: ConversationMessage[] = []
  const visited = new Set<ConversationMessage>()

  const visit = (msg: ConversationMessage): void => {
    if (visited.has(msg)) return
    visited.add(msg)
    ordered.push(msg)
    visitReplies(msg)
  }

  const visitReplies = (parent: ConversationMessage): void => {
    const replies = childrenOfMsg(parent)
    if (replies.length === 0) return
    const main = continuingBranch(replies)
    const mainIsNew = !visited.has(main)
    if (mainIsNew) {
      visited.add(main)
      ordered.push(main)
    }
    for (const reply of replies) {
      if (reply !== main) visit(reply)
    }
    if (mainIsNew) visitReplies(main)
  }

  for (const root of roots) visit(root)
  for (const msg of messages) {
    if (!visited.has(msg)) ordered.push(msg)
  }

  return ordered
}

function parseReferences (cell: string | undefined): ContentReference[] | undefined {
  if (cell == null || cell === '') return undefined
  try {
    const parsed: unknown = JSON.parse(cell)
    return Array.isArray(parsed) ? parsed as ContentReference[] : undefined
  } catch {
    return undefined
  }
}

function parseSources (cell: string | undefined): SearchResultGroup[] | undefined {
  if (cell == null || cell === '') return undefined
  try {
    const parsed: unknown = JSON.parse(cell)
    return Array.isArray(parsed) ? parsed as SearchResultGroup[] : undefined
  } catch {
    return undefined
  }
}
