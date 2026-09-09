// Drift guard between this study's real config and the worker column
// projection (ADR-0032): every column the conversation and calendar
// visualizations declare must survive selectVisualizationColumns and resolve
// downstream. A projection that drops one fails here with the same
// "column chatgpt_conversations.time not found" a participant would see.
//
// The config is generated, not committed (see .gitignore), so this suite
// skips until `pnpm generate-config chatgpt` has run — as it has in CI,
// which generates the config before building.
import fs from 'fs'
import path from 'path'
import { selectVisualizationColumns } from './selectVisualizationColumns'
import { prepareConversationData } from './prepareConversationData'
import { prepareCalendarData } from './prepareCalendarData'
import { Table, ConversationVisualization, CalendarVisualization } from '../types'

const configPath = path.resolve(
  __dirname, '../../../../../../python/port/configs/chatgpt_config.json'
)
const hasConfig = fs.existsSync(configPath)
const describeWithConfig = hasConfig ? describe : describe.skip

const config = hasConfig ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : null
const convTable = config?.tables.find((t: any) => t.id === 'chatgpt_conversations')
const COLUMNS: string[] = convTable != null ? Object.keys(convTable.headers) : []

function row (id: string, title: string, role: string, message: string, time: string) {
  const byName: Record<string, string> = {
    'conversation title': title, role, message, model: 'gpt-4',
    time, 'message id': id, 'reaction to': '',
    'content references': '', search_result_groups: ''
  }
  return { id, cells: COLUMNS.map((c) => byName[c] ?? '') }
}

// r3 is present in originalBody but deleted from body.
const allRows = [
  row('r1', 'Trip planning', 'user', 'How do I get to Utrecht?', '2024-03-01T10:00:00Z'),
  row('r2', 'Trip planning', 'assistant', 'Take the train from Amsterdam.', '2024-03-01T10:00:05Z'),
  row('r3', 'Trip planning', 'user', 'And the cost?', '2024-03-01T10:01:00Z'),
  row('r4', 'Dinner ideas', 'user', 'Suggest a pasta recipe.', '2024-03-02T18:00:00Z')
]
const table: Table = {
  id: 'chatgpt_conversations',
  head: { cells: COLUMNS },
  body: { rows: allRows.filter((r) => r.id !== 'r3') },
  originalBody: { rows: allRows }
}

describeWithConfig('real chatgpt config through the column projection', () => {
  it('the conversation view gets titles, message text and both conversations', async () => {
    const viz = convTable.visualizations.find((v: any) => v.type === 'chat_conversation')
    const projected = selectVisualizationColumns(table, viz as ConversationVisualization)
    const data = await prepareConversationData(projected, viz as ConversationVisualization)

    expect(data.conversations.map((c) => c.title).sort()).toEqual(['Dinner ideas', 'Trip planning'])
    const trip = data.conversations.find((c) => c.title === 'Trip planning')!
    expect(trip.messages.map((m) => m.message)).toContain('How do I get to Utrecht?')
    expect(trip.messages.map((m) => m.role)).toContain('assistant')
    expect(trip.messages.some((m) => m.timestamp != null && m.timestamp !== '')).toBe(true)
  })

  it('the deleted message survives as a restorable placeholder', async () => {
    const viz = convTable.visualizations.find((v: any) => v.type === 'chat_conversation')
    const projected = selectVisualizationColumns(table, viz as ConversationVisualization)
    const data = await prepareConversationData(projected, viz as ConversationVisualization)
    const trip = data.conversations.find((c) => c.title === 'Trip planning')!
    const removed = trip.messages.filter((m: any) => m.removed === true)
    expect(removed).toHaveLength(1)
    expect(removed[0].id).toBe('r3')
  })

  it('the calendar heatmap resolves its date column and keeps row text searchable', async () => {
    const viz = convTable.visualizations.find((v: any) => v.type === 'calendar_heatmap')
    const projected = selectVisualizationColumns(table, viz as CalendarVisualization)
    const data = await prepareCalendarData(projected, viz as CalendarVisualization)

    expect(data.counts.length).toBeGreaterThan(0)
    expect(data.counts.map((c) => c.date).sort()).toEqual(['2024-03-01', '2024-03-02'])
    const day = data.counts.find((c) => c.date === '2024-03-02')!
    expect(day.rowTexts.join('\n')).toContain('Suggest a pasta recipe.')
  })
})
