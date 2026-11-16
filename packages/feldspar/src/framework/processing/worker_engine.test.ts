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

  it('transfers every standalone part of a donation sent in parts', () => {
    const { worker, engine: e } = engine()
    const parts = [new TextEncoder().encode('[{"a":'), new TextEncoder().encode('1}]')]
    const view = new Uint8Array(new ArrayBuffer(8), 2, 4) // a view on a larger buffer is cloned, not moved
    const response = { __type__: 'Response', command: { __type__: 'CommandUIRender', page: {} }, payload: { __type__: 'PayloadJSON', value: [...parts, view] } } as any
    e.nextRunCycle(response)
    expect(worker.postMessage).toHaveBeenCalledWith({ eventType: 'nextRunCycle', response }, [parts[0].buffer, parts[1].buffer])
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

// Eyra review R01: a worker that cannot start or crashes outside Python's own
// error handling shows a page; Stop ends the task as incomplete (exit 1).
describe('WorkerProcessingEngine failures', () => {
  const setup = () => {
    const worker = { postMessage: jest.fn(), onmessage: null, onerror: null } as any
    const onCommand = jest.fn().mockResolvedValue({ __type__: 'Response', command: {}, payload: { __type__: 'PayloadVoid' } })
    const engine = new WorkerProcessingEngine('123', 'nl', worker, { onCommand } as any, undefined, 'example')
    return { worker, onCommand, engine }
  }

  it('shows a start-failure page, then exits nonzero when the participant stops', async () => {
    const { worker, onCommand } = setup()
    worker.onmessage({ data: { eventType: 'initialiseFailed', message: 'NetworkError' } })
    await new Promise((r) => setTimeout(r, 0))
    const page = onCommand.mock.calls[0][0]
    expect(page.__type__).toBe('CommandUIRender')
    expect(page.page.body[0]).toEqual({ __type__: 'PropsUIPageError', message: 'NetworkError', reason: 'start' })
    expect(onCommand.mock.calls[1][0]).toEqual({ __type__: 'CommandSystemExit', code: 1, info: 'Worker error' })
  })

  it('shows the page once, also when the worker reports more errors', async () => {
    const { worker, onCommand } = setup()
    worker.onerror({ message: 'crash' })
    worker.onerror({ message: 'crash again' })
    await new Promise((r) => setTimeout(r, 0))
    const renders = onCommand.mock.calls.filter(([c]: any[]) => c.__type__ === 'CommandUIRender')
    expect(renders.length).toBe(1)
    expect(renders[0][0].page.body[0].reason).toBe('other')
  })
})
