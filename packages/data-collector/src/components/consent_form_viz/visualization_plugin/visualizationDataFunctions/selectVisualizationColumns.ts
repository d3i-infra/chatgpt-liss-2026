import { ChartVisualization, TextVisualization, ConversationVisualization, VisualizationType, Table, TableRow } from '../types'

/**
 * Sentinel for a visualization that reads *every* cell of a row, so no
 * projection is possible. Only for types that genuinely do: the calendar
 * heatmap joins each contributing row's full content into `rowTexts` so the
 * free-text half of a "word DATE:..." query can still match (see
 * prepareCalendarData). Such a table is posted whole, at full structured-clone
 * cost — see ADR-0034's peak-memory budget before adding a third case.
 */
const ALL_COLUMNS = 'all' as const

/**
 * Project a table down to only the columns the visualization reads, so that
 * postMessage structured-clones a fraction of the table into the worker
 * (issue #122). The worker resolves columns by name (getTableColumn), so the
 * projection is transparent to it. Display and donation data are unaffected.
 */
export function selectVisualizationColumns (table: Table, visualization: VisualizationType): Table {
  const requested = visualizationColumns(visualization)
  if (requested === ALL_COLUMNS) return table

  const columns = requested.filter((column) => table.head.cells.includes(column))
  const indices = columns.map((column) => table.head.cells.indexOf(column))
  const projectRows = (rows: TableRow[]): TableRow[] =>
    rows.map((row) => ({
      id: row.id,
      cells: indices.map((index) => row.cells[index])
    }))

  return {
    id: table.id,
    head: { cells: columns },
    body: { rows: projectRows(table.body.rows) },
    // Carried through (projected the same way) rather than dropped: the
    // conversation view reads originalBody to render deleted messages as
    // removed-placeholders, and the worker only ever sees this projection.
    // Absent when the caller passed none, so unaffected tables keep their
    // exact previous shape.
    ...(table.originalBody !== undefined
      ? { originalBody: { rows: projectRows(table.originalBody.rows) } }
      : {})
  }
}

function visualizationColumns (visualization: VisualizationType): string[] | typeof ALL_COLUMNS {
  const columns = new Set<string>()

  if (['line', 'bar', 'area'].includes(visualization.type)) {
    const chart = visualization as ChartVisualization
    columns.add(chart.group.column)
    for (const value of chart.values) {
      if (value.column !== undefined) columns.add(value.column)
      if (value.group_by !== undefined) columns.add(value.group_by)
      if (value.z !== undefined) columns.add(value.z)
    }
  }

  if (visualization.type === 'wordcloud') {
    const text = visualization as TextVisualization
    columns.add(text.textColumn)
    if (text.valueColumn !== undefined) columns.add(text.valueColumn)
  }

  if (visualization.type === 'chat_conversation') {
    const conversation = visualization as ConversationVisualization
    columns.add(conversation.roleColumn)
    columns.add(conversation.messageColumn)
    for (const column of [
      conversation.modelColumn,
      conversation.timestampColumn,
      conversation.titleColumn,
      conversation.referencesColumn,
      conversation.sourcesColumn,
      conversation.idColumn,
      conversation.reactionToColumn
    ]) {
      if (column !== undefined) columns.add(column)
    }
  }

  if (visualization.type === 'calendar_heatmap') return ALL_COLUMNS

  return Array.from(columns)
}
