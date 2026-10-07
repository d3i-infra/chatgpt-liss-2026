// The donation leaves the consent page as UTF-8 bytes in a Uint8Array that owns its
// whole buffer, so WorkerProcessingEngine can transfer it to the worker and Python
// can pass it through as a JsProxy (see roundtrip/RESULTS.md in scripts/benchmarks).
export function encodeConsentData (json: string): Uint8Array {
  return new TextEncoder().encode(json)
}
