import { selectVisualizationColumns } from './selectVisualizationColumns'
import { Table, VisualizationType } from '../types'

function makeTable (): Table {
  return {
    id: 'tiktok_videos',
    head: { cells: ['date', 'title', 'url', 'duration', 'category'] },
    body: {
      rows: [
        { id: 'r1', cells: ['2024-01-01', 'video one', 'https://a.example', '10', 'music'] },
        { id: 'r2', cells: ['2024-01-02', 'video two', 'https://b.example', '20', 'sports'] }
      ]
    }
  }
}

describe('selectVisualizationColumns', () => {
  it('keeps only the columns a chart visualization reads', () => {
    const visualization: VisualizationType = {
      title: { en: 'per day' },
      type: 'line',
      group: { column: 'date' },
      values: [{ column: 'duration', aggregate: 'sum', group_by: 'category' }]
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.head.cells).toEqual(['date', 'duration', 'category'])
    expect(projected.body.rows).toEqual([
      { id: 'r1', cells: ['2024-01-01', '10', 'music'] },
      { id: 'r2', cells: ['2024-01-02', '20', 'sports'] }
    ])
    expect(projected.id).toBe('tiktok_videos')
  })

  it('does not materialize the .COUNT pseudo-column', () => {
    const visualization: VisualizationType = {
      title: { en: 'count per day' },
      type: 'bar',
      group: { column: 'date' },
      values: [{ column: '.COUNT' }]
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.head.cells).toEqual(['date'])
  })

  it('keeps textColumn and valueColumn for a wordcloud', () => {
    const visualization: VisualizationType = {
      title: { en: 'words' },
      type: 'wordcloud',
      textColumn: 'title',
      valueColumn: 'duration'
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.head.cells).toEqual(['title', 'duration'])
    expect(projected.body.rows[0].cells).toEqual(['video one', '10'])
  })

  it('drops referenced columns that do not exist in the table (worker reports the error)', () => {
    const visualization: VisualizationType = {
      title: { en: 'bad' },
      type: 'bar',
      group: { column: 'no_such_column' },
      values: [{ column: 'duration' }]
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.head.cells).toEqual(['duration'])
  })

  it('preserves row ids so rowId-based deletion still works', () => {
    const visualization: VisualizationType = {
      title: { en: 'per day' },
      type: 'area',
      group: { column: 'date' },
      values: [{ column: 'duration' }]
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.body.rows.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('keeps every declared column for a chat_conversation, required and optional', () => {
    const visualization: VisualizationType = {
      title: { en: 'conversations' },
      type: 'chat_conversation',
      roleColumn: 'category',
      messageColumn: 'title',
      timestampColumn: 'date',
      idColumn: 'url'
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.head.cells).toEqual(['category', 'title', 'date', 'url'])
    expect(projected.body.rows[0].cells).toEqual(['music', 'video one', '2024-01-01', 'https://a.example'])
  })

  it('omits chat_conversation optionals the visualization did not declare', () => {
    const visualization: VisualizationType = {
      title: { en: 'conversations' },
      type: 'chat_conversation',
      roleColumn: 'category',
      messageColumn: 'title'
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected.head.cells).toEqual(['category', 'title'])
  })

  // prepareConversationData reads originalBody to render deleted messages as
  // removed-placeholders; if the projection dropped it they would silently
  // vanish instead.
  it('projects originalBody alongside body for a chat_conversation', () => {
    const table = makeTable()
    table.originalBody = {
      rows: [
        ...table.body.rows,
        { id: 'r3', cells: ['2024-01-03', 'deleted one', 'https://c.example', '30', 'news'] }
      ]
    }
    const visualization: VisualizationType = {
      title: { en: 'conversations' },
      type: 'chat_conversation',
      roleColumn: 'category',
      messageColumn: 'title'
    }
    const projected = selectVisualizationColumns(table, visualization)
    expect(projected.originalBody?.rows).toEqual([
      { id: 'r1', cells: ['music', 'video one'] },
      { id: 'r2', cells: ['sports', 'video two'] },
      { id: 'r3', cells: ['news', 'deleted one'] }
    ])
  })

  it('leaves out originalBody when the table has none', () => {
    const visualization: VisualizationType = {
      title: { en: 'words' },
      type: 'wordcloud',
      textColumn: 'title'
    }
    const projected = selectVisualizationColumns(makeTable(), visualization)
    expect(projected).not.toHaveProperty('originalBody')
  })

  // The heatmap joins each row's full content into rowTexts so the free-text
  // half of a "word DATE:..." query still matches, so there is nothing to
  // project away.
  it('passes the whole table through for a calendar_heatmap', () => {
    const table = makeTable()
    const visualization: VisualizationType = {
      title: { en: 'per day' },
      type: 'calendar_heatmap',
      dateColumn: 'date'
    }
    const projected = selectVisualizationColumns(table, visualization)
    expect(projected.head.cells).toEqual(['date', 'title', 'url', 'duration', 'category'])
    expect(projected.body.rows[0].cells).toHaveLength(5)
  })
})
