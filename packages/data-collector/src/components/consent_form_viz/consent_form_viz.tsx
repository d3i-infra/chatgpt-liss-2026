import {
  DonateButtons,
  ReactFactoryContext,
} from "@eyra/feldspar"
import TextBundle from "@eyra/feldspar"
import { resolveText } from "../../locale/text"
import { 
    TableWithContext,
    TableContext,
    PropsUITable,
    PropsUITableBody,
    PropsUITableHead,
    PropsUIPromptConsentFormViz,
    PropsUIPromptConsentFormTableViz,
    PropsUITableRow,
} from "./types"
import { useCallback, useEffect, useRef, useState, ReactElement } from "react"
import _ from "lodash"
import { TableContainer } from "./table_container"

type Props = PropsUIPromptConsentFormViz & ReactFactoryContext

export const ConsentFormViz = (props: Props): ReactElement => {
  function rowCell(dataFrame: any, column: string, row: number): string {
    const text = String(dataFrame[column][`${row}`])
    return text
  }

  function columnNames(dataFrame: any): string[] {
    return Object.keys(dataFrame)
  }

  function columnCount(dataFrame: any): number {
    return columnNames(dataFrame).length
  }

  function rowCount(dataFrame: any): number {
    if (columnCount(dataFrame) === 0) {
      return 0
    } else {
      const firstColumn = dataFrame[columnNames(dataFrame)[0]]
      return Object.keys(firstColumn).length - 1
    }
  }

  function rows(data: any): PropsUITableRow[] {
    const result: PropsUITableRow[] = []
    const n = rowCount(data)
    for (let row = 0; row <= n; row++) {
      const id = `${row}`
      const cells = columnNames(data).map((column: string) => rowCell(data, column, row))
      result.push({ id, cells })
    }
    return result
  }

  function parseTables(tablesData: PropsUIPromptConsentFormTableViz[]): Array<PropsUITable & TableContext> {
    return tablesData.map((table) => parseTable(table))
  }

  function parseTable(tableData: PropsUIPromptConsentFormTableViz): PropsUITable & TableContext {
    const id = tableData.id
    const title = resolveText(tableData.title, props.locale)
    const description =
      tableData.description !== undefined ? resolveText(tableData.description, props.locale) : ""
    const deletedRowCount = 0
    const dataFrame = loadDataFrame(tableData.data_frame)
    const headCells = columnNames(dataFrame).map((column: string) => column)
    const head: PropsUITableHead = {
      cells: headCells,
    }
    const body: PropsUITableBody = {
      rows: rows(dataFrame),
    }

    // Translate column headers if provided. The headers dict maps DataFrame
    // column names to Translatable objects. We resolve them to the current
    // locale for display, while head.cells retains the raw DataFrame column
    // names for visualization data lookups.
    let translatedHeaders: Record<string, string> | undefined
    if (tableData.headers != null) {
      translatedHeaders = {}
      for (const [column, text] of Object.entries(tableData.headers)) {
        translatedHeaders[column] = resolveText(text, props.locale)
      }
    }

    return {
      __type__: "PropsUITable",
      id,
      head,
      body,
      title,
      description,
      deletedRowCount,
      annotations: [],
      originalBody: body,
      deletedRows: [],
      visualizations: tableData.visualizations,
      headers: translatedHeaders,
      folded: tableData.folded || false,
      deleteOption: tableData.delete_option,
    }
  }

  const [tables, setTables] = useState<TableWithContext[]>(() => parseTables(props.tables))
  const { locale, resolve } = props
  const { description, helpButton, helpText } = prepareCopy(props)
  const [showHelp, setShowHelp] = useState(false)
  // The state initializer above already parsed props.tables; only re-parse
  // when the host actually sends new tables (issue #122 double parse).
  const parsedTables = useRef(props.tables)

  useEffect(() => {
    if (parsedTables.current === props.tables) return
    parsedTables.current = props.tables
    setTables(parseTables(props.tables))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- PENDING_ISSUES "lint hygiene" entry 2026-08-26: consent_form_viz re-parse effect intentionally omits `parseTables` from deps. parseTables is a plain closure re-created every render, so listing it would make the dependency "changed" on every render regardless of whether props.tables actually changed; the effect's own ref-comparison guard (not this array) is what enforces ADR-0031's parse-once contract (issue #122 double parse), and widening this dependency array is exactly the kind of edit that has previously broken that contract by accident. A real fix would hoist parseTables/parseTable out of the component (or wrap them in useCallback keyed only on props.locale) so the function identity is stable and can be listed honestly.
  }, [props.tables])

  const updateTable = useCallback((tableId: string, table: TableWithContext) => {
    setTables((tables) => {
      const index = tables.findIndex((table) => table.id === tableId)
      if (index === -1) return tables

      const newTables = [...tables]
      newTables[index] = table
      return newTables
    })
  }, [])

  function handleDonate(): void {
    const value = serializeConsentData()
    resolve?.({ __type__: "PayloadJSON", "value": value })
  }

  function handleCancel(): void {
    resolve?.({ __type__: "PayloadFalse", value: false })
  }

  function serializeConsentData(): string {
    const array = serializeTables()
    return JSON.stringify(array)
  }

  function serializeTables(): any[] {
    return tables.map((table) => serializeTable(table))
  }


  function serializeTable({ id, head, body: { rows }, deletedRowCount }: TableWithContext): any {
    const data = rows.map((row) => serializeRow(row, head))
    return { [id]: data, "deleted row count": deletedRowCount.toString() }
  }

  function serializeRow(row: PropsUITableRow, head: PropsUITableHead): any {
    const keys = head.cells.map((cell) => cell)
    const values = row.cells.map((cell) => cell)
    return _.fromPairs(_.zip(keys, values))
  }

  return (
    <>
      <div className="">
        {description.split("\n").map((line, index) => (
          <span className="text-bodylarge font-body mb-4" key={"description" + String(index)}>
            {line}
          </span>
        ))}
        <div className="mt-2 mb-6">
          <button
            type="button"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((value) => !value)}
            className="flex items-center gap-2 text-primary font-body text-bodymedium focus:outline-none"
          >
            <div className={`transition-transform duration-200 ${showHelp ? "rotate-90" : ""}`}>
              {chevronIcon}
            </div>
            <span className="hover:underline cursor-pointer font-semibold">{helpButton}</span>
          </button>
          {showHelp && (
            <div className="bg-primary/10 border-l-4 border-primary ml-[7px] pl-4 pr-4 mb-2">
              {helpText.split("\n").map((line, index) => (
                <span className="text-bodymedium font-body" key={"help" + String(index)}>
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-8 md:gap-2 w-full">
        <div className="grid gap-8 max-w-full">
          {tables.map((table) => {
            return (
              <TableContainer key={table.id} id={table.id} table={table} updateTable={updateTable} locale={locale} />
            )
          })}
        </div>
        <div>
          <hr className='border-grey3 mb-4' />
          <DonateButtons
            onDonate={handleDonate}
            onCancel={handleCancel}
            locale={locale}
            donateQuestion={props.donateQuestion ?? defaultDonateQuestionLabel}
            donateButton={props.donateButton ?? defaultDonateButtonLabel}
          />
        </div>
      </div>
    </>
  )
}

interface Copy {
  description: string
  helpButton: string
  helpText: string
}

function prepareCopy({ description, helpButton, helpText, locale }: Props): Copy {
  return {
    description: resolveText(description ?? defaultDescription, locale),
    helpButton: resolveText(helpButton ?? defaultHelpButtonLabel, locale),
    helpText: resolveText(helpText ?? defaultHelpText, locale),
  }
}

function loadDataFrame(dataFrame: any) {
  if (typeof dataFrame === "string") {
      return JSON.parse(dataFrame)
  } 
  return dataFrame;
}

const defaultDonateQuestionLabel = new TextBundle()
  .add('en', 'Do you want to share the above data?')
  .add('de', 'Möchten Sie die oben genannten Daten teilen?')
  .add('nl', 'Wilt u de bovenstaande gegevens delen?')
  .add('it', 'Vuole condividere i dati sopra riportati?')
  .add('es', '¿Desea compartir los datos anteriores?')

const defaultDonateButtonLabel = new TextBundle()
  .add('en', 'Yes, share for research')
  .add('de', 'Ja, für Forschung teilen')
  .add('nl', 'Ja, deel voor onderzoek')
  .add('it', 'Sì, condividi per la ricerca')
  .add('es', 'Sí, compartir para la investigación')

const chevronIcon = (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const defaultHelpButtonLabel = new TextBundle()
  .add('en', 'How does it work?')
  .add('de', 'Wie funktioniert das?')
  .add('nl', 'Hoe werkt het?')

const defaultHelpText = new TextBundle()
  .add('en', 'Not all the data from the archive you just uploaded are needed for research. The research team has selected only the data that are needed to answer their research questions. Below you can review for each selected type of data what information from your archive will be shared when you choose to donate. You can inspect every item and remove anything you do not want to share. Use the search field to find specific items. Until you choose to share using the donate button at the bottom of the page, all data on this page stays with you on your device.')
  .add('de', 'Nicht alle Daten aus dem Archiv, das Sie gerade hochgeladen haben, werden für die Forschung benötigt. Das Forschungsteam hat nur die Daten ausgewählt, die benötigt werden, um ihre Forschungsfragen zu beantworten. Unten können Sie für jeden ausgewählten Datentyp überprüfen, welche Informationen aus Ihrem Archiv geteilt werden, wenn Sie sich entscheiden, diese zu spenden. Sie können jedes Element überprüfen und alles entfernen, was Sie nicht teilen möchten. Verwenden Sie das Suchfeld, um bestimmte Elemente zu finden. Bis Sie sich entscheiden, die Daten mit der Spenden-Schaltfläche am unteren Rand der Seite zu teilen, bleiben alle Daten auf dieser Seite bei Ihnen auf Ihrem Gerät.')
  .add('nl', 'Niet alle gegevens uit het archief dat u zojuist hebt geüpload zijn nodig voor onderzoek. Het onderzoeksteam heeft alleen de gegevens geselecteerd die nodig zijn om hun onderzoeksvragen te beantwoorden. Hieronder kunt u voor elk type gegevens dat is geselecteerd bekijken welke informatie uit uw archief zal worden gedeeld als u kiest om te doneren. U kunt elk item inspecteren en alles verwijderen wat u niet wilt delen. Gebruik het zoekveld om specifieke items te vinden. Alle gegevens op deze pagina blijven bij u, op uw apparaat, totdat u ze besluit te delen met de donatieknop onderaan de pagina.')

const defaultDescription = new TextBundle()
  .add('en', 'Determine whether you would like to share the data below. Carefully check the data and adjust when required. With your contribution, you help the previously described research. Thank you in advance.')
  .add('de', 'Legen Sie fest, ob Sie die untenstehenden Daten teilen möchten. Überprüfen Sie die Daten sorgfältig und passen Sie sie bei Bedarf an. Mit Ihrem Beitrag helfen Sie der zuvor beschriebenen Forschung. Vielen Dank im Voraus.')
  .add('nl', 'Bepaal of u de onderstaande gegevens wilt delen. Bekijk de gegevens zorgvuldig en pas zo nodig aan. Met uw bijdrage helpt u het eerder beschreven onderzoek. Alvast hartelijk dank.')
  .add('it', 'Decida se desidera condividere i dati riportati di seguito. Controlli attentamente i dati e li modifichi se necessario. Con il suo contributo aiuta la ricerca descritta in precedenza. Grazie in anticipo.')
  .add('es', 'Decida si desea compartir los datos que aparecen a continuación. Revise los datos con atención y modifíquelos si es necesario. Con su contribución ayuda a la investigación descrita anteriormente. Muchas gracias de antemano.')

