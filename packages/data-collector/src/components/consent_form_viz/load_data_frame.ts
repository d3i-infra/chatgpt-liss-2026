// Consent tables arrive as UTF-8 JSON bytes, transferred from the worker
// rather than cloned (d3i_props.translate_data_frame, py_worker.js).
export function loadDataFrame (dataFrame: any): any {
  if (dataFrame instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(dataFrame))
  }
  if (typeof dataFrame === 'string') {
    return JSON.parse(dataFrame)
  }
  return dataFrame
}
