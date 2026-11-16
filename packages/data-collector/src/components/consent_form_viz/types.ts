// Matching feldspar's Text/Translatable (duplicated like visualization_plugin/types.ts
// to keep the plugin self-contained). Previously `Text` silently resolved to the DOM
// global Text node type.
export interface Translatable {
  translations: { [locale: string]: string }
}
export type Text = Translatable | string

export interface PropsUIPromptConsentFormTableViz {
  __type__: "PropsUIPromptConsentFormTableViz"
  id: string
  title: Text
  description: Text
  data_frame: any
  visualizations: any
  headers?: Record<string, Text>
  folded: boolean
  delete_option: boolean
  // Error counts from extracting this table (e.g. skipped messages), donated
  // with it as "extraction errors" (Eyra review R03).
  extraction_errors?: Record<string, number>
}

export interface PropsUIPromptConsentFormViz {
  __type__: "PropsUIPromptConsentFormViz"
  description?: Text
  donateQuestion?: Text
  donateButton?: Text
  helpButton?: Text
  helpText?: Text
  // Highlighted notice above the tables, e.g. that some data could not be read.
  notice?: Text | null
  // Largest donation part in bytes; each part is its own request to the host.
  donatePartBytes?: number | null
  tables: PropsUIPromptConsentFormTableViz[]
}

export interface Annotation {
  row_id: string
  [key: string]: any
}

export interface TableContext {
  title: string
  description: string
  deletedRowCount: number
  annotations: Annotation[]
  originalBody: PropsUITableBody
  deletedRows: string[][]
  visualizations?: any[]
  headers?: Record<string, string>
  folded: boolean
  deleteOption: boolean
  extractionErrors: Record<string, number>
}

export type TableWithContext = TableContext & PropsUITable

export interface PropsUICheckBox {
  id: string
  selected: boolean
  size: string
  onSelect: () => void
}

// TABLE

export interface PropsUITable {
  __type__: "PropsUITable"
  id: string
  head: PropsUITableHead
  body: PropsUITableBody
  pageSize?: number
}

export interface PropsUITableHead {
  cells: string[]
}

export interface PropsUITableBody {
  rows: PropsUITableRow[]
}

// KW: removed __type__ for rows and cells, because it inflates the table memory size
export interface PropsUITableRow {
  id: string
  cells: string[]
}

export interface PropsUISearchBar {
  search: string
  onSearch: (search: string) => void
  placeholder?: string
  debounce?: number
}
