import { encodeConsentData } from './encode_consent_data'

// The donation leaves the consent page as UTF-8 bytes, so it can be transferred to
// the worker and through Python without the string conversions Pyodide would make.
describe('encodeConsentData', () => {
  it('encodes the serialized tables as UTF-8 bytes that decode back unchanged', () => {
    const json = '[{"table":[{"message":"héllo – “quoted” 👋"}],"deleted row count":"0"}]'
    const bytes = encodeConsentData(json)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBe(Buffer.byteLength(json, 'utf8'))
    expect(new TextDecoder().decode(bytes)).toBe(json)
  })

  it('owns its whole buffer so it can be transferred', () => {
    const bytes = encodeConsentData('{}')
    expect(bytes.byteOffset).toBe(0)
    expect(bytes.byteLength).toBe(bytes.buffer.byteLength)
  })
})
