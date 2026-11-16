// One table as it is donated: its rows plus counts the researcher needs to
// interpret them — rows the participant deleted, and errors met while
// extracting the table, e.g. messages that could not be read and were left
// out (Eyra review R03). Always present, `{}` when there were none, so
// parsers can rely on the field.
export function serializedTable (
  id: string,
  rows: unknown[],
  deletedRowCount: number,
  extractionErrors: Record<string, number>
): Record<string, unknown> {
  return {
    [id]: rows,
    "deleted row count": deletedRowCount.toString(),
    "extraction errors": { ...extractionErrors },
  }
}
