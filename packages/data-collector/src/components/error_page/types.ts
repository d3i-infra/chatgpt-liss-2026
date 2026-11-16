// An error outside Python's own error handling (built by py_worker.js and
// WorkerProcessingEngine; Eyra review R01). `reason` selects the explanation;
// `message` is technical and only shown collapsed.
export interface PropsUIPageError {
  __type__: 'PropsUIPageError'
  message: string
  reason?: 'memory' | 'start' | 'other'
}
