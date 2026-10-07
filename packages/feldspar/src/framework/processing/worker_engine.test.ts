import WorkerProcessingEngine from './worker_engine'
import { CommandHandler } from '../types/modules'

const commandHandler: CommandHandler = {
  onCommand: jest.fn(),
}

describe('WorkerProcessingEngine', () => {
  it('posts the #960 data dict with sessionId, locale, and platform', () => {
    const worker = { postMessage: jest.fn(), onmessage: null } as any
    const engine = new WorkerProcessingEngine('123', 'nl', worker, commandHandler, undefined, 'example')
    engine.firstRunCycle()
    expect(worker.postMessage).toHaveBeenCalledWith({
      eventType: 'firstRunCycle',
      data: { sessionId: '123', locale: 'nl', platform: 'example' },
    })
  })

  // The platform prop is the only source (ADR-0004): with no platform argument the
  // handshake carries `undefined`, and the Python layer raises — nothing substitutes
  // a value here.
  it('sends an undefined platform when the constructor was given none', () => {
    const worker = { postMessage: jest.fn(), onmessage: null } as any
    const engine = new WorkerProcessingEngine('123', 'nl', worker, commandHandler, undefined)
    engine.firstRunCycle()
    expect(worker.postMessage).toHaveBeenCalledWith({
      eventType: 'firstRunCycle',
      data: { sessionId: '123', locale: 'nl', platform: undefined },
    })
  })
})

// The consent page's donation is UTF-8 bytes; posting the Response moves that buffer
// to the worker instead of cloning it (the mirror of py_worker.js's transferablesOf).
// Only the payload's own buffers move: the echoed command may hold buffers the page
// still reads.
describe('WorkerProcessingEngine.nextRunCycle', () => {
  const engine = () => {
    const worker = { postMessage: jest.fn(), onmessage: null } as any
    return { worker, engine: new WorkerProcessingEngine('123', 'nl', worker, commandHandler, undefined, 'example') }
  }

  it('transfers the buffer of a bytes payload', () => {
    const { worker, engine: e } = engine()
    const value = new TextEncoder().encode('{"a":1}')
    const response = { __type__: 'Response', command: { __type__: 'CommandUIRender', page: {} }, payload: { __type__: 'PayloadJSON', value } } as any
    e.nextRunCycle(response)
    expect(worker.postMessage).toHaveBeenCalledWith({ eventType: 'nextRunCycle', response }, [value.buffer])
  })

  it('posts a string payload with nothing to transfer', () => {
    const { worker, engine: e } = engine()
    const response = { __type__: 'Response', command: { __type__: 'CommandUIRender', page: {} }, payload: { __type__: 'PayloadJSON', value: '{"a":1}' } } as any
    e.nextRunCycle(response)
    expect(worker.postMessage).toHaveBeenCalledWith({ eventType: 'nextRunCycle', response }, [])
  })

  it('leaves buffers inside the echoed command alone', () => {
    const { worker, engine: e } = engine()
    const bytes = new Uint8Array(4)
    const response = { __type__: 'Response', command: { __type__: 'CommandUIRender', page: { data_frame: bytes } }, payload: { __type__: 'PayloadVoid', value: undefined } } as any
    e.nextRunCycle(response)
    expect(worker.postMessage).toHaveBeenCalledWith({ eventType: 'nextRunCycle', response }, [])
  })
})
