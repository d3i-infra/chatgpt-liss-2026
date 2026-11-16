import { prepareConversationData, unreadableTimestampOf } from './prepareConversationData'
import { ConversationVisualization, Table } from '../types'

const COLUMNS = ['conversation title', 'role', 'message', 'time', 'message id', 'reaction to', 'hidden']

function makeTable (rows: Array<[string, string, string, string, string]>, hidden: Record<string, unknown> = {}): Table {
  return {
    id: 'chatgpt_conversations',
    head: { cells: COLUMNS },
    body: {
      rows: rows.map(([id, role, message, time, reactionTo]) => ({
        id,
        // A real DataFrame boolean arrives as-is, not as a string.
        cells: ['Chat', role, message, time, id, reactionTo, (hidden[id] ?? false) as string]
      }))
    }
  }
}

const visualization: ConversationVisualization = {
  title: { en: 'conversations' },
  type: 'chat_conversation',
  roleColumn: 'role',
  messageColumn: 'message',
  timestampColumn: 'time',
  titleColumn: 'conversation title',
  idColumn: 'message id',
  reactionToColumn: 'reaction to',
  hiddenColumn: 'hidden'
}

async function order (table: Table, viz = visualization): Promise<string[]> {
  const data = await prepareConversationData(table, viz)
  return data.conversations[0].messages.map((m) => m.id)
}

// Two replies to q1 created in the same second (as when ChatGPT offers two
// replies to compare): a1 was picked and the conversation continues on it,
// b1 is hidden. b1 is listed first so it also sorts first.
const branched: Array<[string, string, string, string, string]> = [
  ['q1', 'user', 'question', '2026-07-10T14:08:18+00:00', 'root'],
  ['b1', 'assistant', 'hidden reply', '2026-07-10T14:08:23+00:00', 'q1'],
  ['a1', 'assistant', 'shown reply', '2026-07-10T14:08:23+00:00', 'q1'],
  ['q2', 'user', 'follow-up', '2026-07-10T14:09:00+00:00', 'a1'],
  ['a2', 'assistant', 'answer', '2026-07-10T14:09:05+00:00', 'q2']
]

describe('prepareConversationData sibling branches', () => {
  it('puts the shown reply first, then the hidden one, then the continuation', async () => {
    expect(await order(makeTable(branched, { b1: true }))).toEqual(['q1', 'a1', 'b1', 'q2', 'a2'])
  })

  it('marks only the hidden message', async () => {
    const data = await prepareConversationData(makeTable(branched, { b1: true }), visualization)
    const hidden = data.conversations[0].messages.filter((m) => m.hidden === true).map((m) => m.id)
    expect(hidden).toEqual(['b1'])
  })

  it('accepts the hidden flag as text', async () => {
    const data = await prepareConversationData(makeTable(branched, { b1: 'True' }), visualization)
    expect(data.conversations[0].messages.find((m) => m.id === 'b1')?.hidden).toBe(true)
  })

  it('keeps a hidden branch together with its own follow-ups', async () => {
    const rows: Array<[string, string, string, string, string]> = [
      ...branched,
      ['q3', 'user', 'follow-up on hidden', '2026-07-10T14:08:40+00:00', 'b1']
    ]
    expect(await order(makeTable(rows, { b1: true, q3: true }))).toEqual(['q1', 'a1', 'b1', 'q3', 'q2', 'a2'])
  })

  it('without a hidden column, continues on the branch with the most messages', async () => {
    const { hiddenColumn, ...withoutHidden } = visualization
    expect(await order(makeTable(branched), withoutHidden)).toEqual(['q1', 'a1', 'b1', 'q2', 'a2'])
  })
})

describe('prepareConversationData content type', () => {
  const table: Table = {
    id: 'chatgpt_conversations',
    head: { cells: ['conversation title', 'role', 'message', 'content type'] },
    body: {
      rows: [
        { id: 'q1', cells: ['Chat', 'user', 'look at this', 'multimodal_text'] },
        { id: 't1', cells: ['Chat', 'assistant', 'considering the image', 'thoughts'] }
      ]
    }
  }

  it('carries each message its content type', async () => {
    const data = await prepareConversationData(table, { ...visualization, contentTypeColumn: 'content type' })
    expect(data.conversations[0].messages.map((m) => m.contentType)).toEqual(['multimodal_text', 'thoughts'])
  })

  it('leaves it unset without a content type column', async () => {
    const data = await prepareConversationData(table, visualization)
    expect(data.conversations[0].messages.every((m) => m.contentType === undefined)).toBe(true)
  })
})

// Eyra review R05: a time that could not be read is shown as such, never as
// "Invalid Date", and its original value is kept for display.
describe('prepareConversationData unreadable time', () => {
  const columns = ['conversation title', 'role', 'message', 'time', 'unreadable time', 'message id', 'reaction to']
  const table: Table = {
    id: 'chatgpt_conversations',
    head: { cells: columns },
    body: {
      rows: [
        { id: 'q', cells: ['Chat', 'user', 'hi', '2026-01-01T10:00:00+00:00', '', 'q', ''] },
        { id: 'a', cells: ['Chat', 'assistant', 'hello', '', '1783692498900000', 'a', 'q'] },
        { id: 'b', cells: ['Chat', 'assistant', 'again', 'not a date', '', 'b', 'a'] },
      ]
    }
  }
  const viz: ConversationVisualization = { ...visualization, hiddenColumn: undefined, unreadableTimestampColumn: 'unreadable time' }

  it('marks messages whose time could not be read, with the original value', async () => {
    const data = await prepareConversationData(table, viz)
    const byId = Object.fromEntries(data.conversations[0].messages.map((m) => [m.id, m]))
    expect(byId.q.timestamp).toBe('2026-01-01T10:00:00+00:00')
    expect(byId.q.unreadableTimestamp).toBeUndefined()
    expect(byId.a.timestamp).toBeUndefined()
    expect(byId.a.unreadableTimestamp).toBe('1783692498900000')
    // Not flagged by the extractor, but not a date either.
    expect(byId.b.timestamp).toBeUndefined()
    expect(byId.b.unreadableTimestamp).toBe('not a date')
  })

  it('dates the conversation by its readable times only', async () => {
    const data = await prepareConversationData(table, viz)
    expect(data.conversations[0].date).toBe('2026-01-01T10:00:00+00:00')
  })
})

describe('unreadableTimestampOf', () => {
  it('treats empty times as absent, not unreadable', () => {
    expect(unreadableTimestampOf('', '')).toBeUndefined()
    expect(unreadableTimestampOf(undefined, undefined)).toBeUndefined()
  })
})
