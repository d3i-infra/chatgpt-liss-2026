import { useMemo, ReactElement } from 'react'
import TextBundle from '@eyra/feldspar'
import { resolveAll } from '../../locale/text'
import { TableWithContext } from './types'
import UndoSvg from './assets/images/undo.svg'

interface Props {
  table: TableWithContext
  searchedTable: TableWithContext
  handleUndo: () => void
  locale: string
}

export const TableItems = ({ table, searchedTable, handleUndo, locale }: Props): ReactElement => {
  const text = useMemo(() => getTranslations(locale), [locale])

  const deleted = table.deletedRowCount
  const n = table.body.rows.length
  const searched = searchedTable.body.rows.length
  const total = table.originalBody.rows.length - table.deletedRowCount

  const nLabel = n.toLocaleString(locale, { useGrouping: true })
  const totalLabel = total.toLocaleString(locale, { useGrouping: true })
  const searchLabel = searched.toLocaleString(locale, { useGrouping: true })
  const deletedLabel = deleted.toLocaleString('en', { useGrouping: true }) + ' ' + text.deleted

  function rowsLabel (): string {
    if (n === 0) return text.noData
    if (searched < n) return searchLabel + ' / ' + nLabel + ' ' + text.rows
    return nLabel + ' ' + text.rows
  }

  return (
    <div className='flex  min-w-[200px] gap-1'>
      {/* <div className='flex items-center'>{tableIcon}</div> */}
      <div
        key={`{totalLabel}_{deleted}`}
        className='flex flex-wrap items-center gap-x-1 animate-fadeIn text-base italic font-label'
      >
        <div className={n > 0 ? '' : 'hidden'}>
          {text.dataset} {table.head.cells.length} {text.columns},
        </div>
        <div key={totalLabel} className='animate-fadeIn'>
          {rowsLabel()}
          {deleted > 0 ? '.' : ''}
        </div>

        <div className={`flex text-grey2 ${deleted > 0 ? '' : 'hidden'}`}>
          {deletedLabel}
          <img
            src={UndoSvg}
            className='w-5 h-5 -translate-y-[2px] md:-translate-y-0 -translate-x-[3px] ml-2'
            onClick={handleUndo}
          />
        </div>
      </div>
    </div>
  )
}

const tableIcon = (
  <svg className='h-9' viewBox='4 4 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'>
    <rect x='9' y='9' width='4' height='2' fill='#4272EF' />
    <rect x='9' y='13' width='4' height='2' fill='#4272EF' />
    <rect x='9' y='17' width='4' height='2' fill='#4272EF' />
    <rect x='15' y='9' width='4' height='2' fill='#4272EF' />
    <rect x='15' y='13' width='4' height='2' fill='#4272EF' />
    <rect x='15' y='17' width='4' height='2' fill='#4272EF' />
    <rect x='4' y='4' width='15' height='3' fill='#4272EF' />
    <rect x='4' y='9' width='3' height='10' fill='#4272EF' />
  </svg>
)

function getTranslations (locale: string): Record<string, string> {
  return resolveAll(translations, locale)
}

const translations = {
  // de/it/es are provisional machine translations pending native-speaker
  // review, like the rest of those locales (see README, Localization status).
  dataset: new TextBundle()
    .add('en', 'This data consists of')
    .add('nl', 'Deze gegevens bestaan uit')
    .add('de', 'Diese Daten bestehen aus')
    .add('it', 'Questi dati sono composti da')
    .add('es', 'Estos datos constan de'),
  columns: new TextBundle()
    .add('en', 'columns')
    .add('nl', 'kolommen')
    .add('de', 'Spalten')
    .add('it', 'colonne')
    .add('es', 'columnas'),
  rows: new TextBundle()
    .add('en', 'rows')
    .add('nl', 'rijen')
    .add('de', 'Zeilen')
    .add('it', 'righe')
    .add('es', 'filas'),
  noData: new TextBundle()
    .add('en', 'no data')
    .add('nl', 'geen data')
    .add('de', 'keine Daten')
    .add('it', 'nessun dato')
    .add('es', 'sin datos'),
  // Rendered after a count, as "3 rows have been deleted" — the fuller phrasing
  // this study uses, not upstream's bare "deleted".
  deleted: new TextBundle()
    .add('en', 'rows have been deleted')
    .add('nl', 'rijen zijn verwijderd')
    .add('de', 'Zeilen wurden gelöscht')
    .add('it', 'righe sono state eliminate')
    .add('es', 'filas han sido eliminadas')
}
