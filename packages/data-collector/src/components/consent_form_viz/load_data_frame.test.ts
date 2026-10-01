import { loadDataFrame } from './load_data_frame'

describe('loadDataFrame', () => {
  const json = '{"message":{"0":"héllo – “quoted” 👋"},"n":{"0":1}}'

  it('decodes UTF-8 bytes transferred from the worker', () => {
    expect(loadDataFrame(new TextEncoder().encode(json))).toEqual(JSON.parse(json))
  })

  it('still parses a JSON string', () => {
    expect(loadDataFrame(json)).toEqual(JSON.parse(json))
  })

  it('passes an already-parsed object through', () => {
    const obj = { a: { 0: 1 } }
    expect(loadDataFrame(obj)).toBe(obj)
  })
})
