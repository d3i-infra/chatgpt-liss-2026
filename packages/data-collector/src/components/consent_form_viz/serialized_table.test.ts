import { serializedTable } from './serialized_table'

describe('serializedTable', () => {
  it('donates extraction error counts next to the deleted row count', () => {
    const table = serializedTable('chatgpt_conversations', [{ message: 'hi' }], 2, { SkippedMessage: 3 })
    expect(table).toEqual({
      chatgpt_conversations: [{ message: 'hi' }],
      'deleted row count': '2',
      'extraction errors': { SkippedMessage: 3 },
    })
  })

  it('always includes the extraction errors field', () => {
    expect(serializedTable('t', [], 0, {})['extraction errors']).toEqual({})
  })
})
