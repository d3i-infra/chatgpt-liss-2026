import { CommandHandler } from '../types/modules'
import { CommandSystemEvent, isCommand, Response } from '../types/commands'
import { Logger } from '../logging'

export default class WorkerProcessingEngine {
  sessionId: String
  locale: String
  worker: Worker
  commandHandler: CommandHandler
  logger?: Logger
  platform?: string

  resolveInitialized!: () => void;
  resolveContinue!: () => void;

  constructor (
    sessionId: string,
    locale: string,
    worker: Worker,
    commandHandler: CommandHandler,
    logger?: Logger,
    platform?: string
  ) {
    this.sessionId = sessionId
    this.locale = locale
    this.commandHandler = commandHandler
    this.worker = worker
    this.logger = logger
    this.platform = platform
    this.initWorkerEventHandlers()
  }

  private initWorkerEventHandlers (): void {
    this.worker.onmessage = (event) => {
      this.logger?.log('debug', `Received event from worker: ${event.data.eventType}`)
      this.handleEvent(event)
    }
    this.worker.onerror = (error) => {
      this.logger?.log('error', `Worker error: ${error.message}`, {
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
      })
      this.showFailure('other', String(error.message ?? ''))
    }
  }

  sendSystemEvent(name: string): void {
    const command: CommandSystemEvent = {
      __type__: "CommandSystemEvent",
      name,
    };
    this.commandHandler.onCommand(command).then(
      () => {},
      () => {},
    );
  }

  handleEvent (event: any): void {
    const { eventType } = event.data
    switch (eventType) {
      case 'initialiseDone':
        this.logger?.log('debug', 'Worker initialisation done')
        this.resolveInitialized()
        break

      case 'initialiseFailed':
        this.logger?.log('error', 'Worker initialisation failed')
        this.showFailure('start', String(event.data.message ?? ''))
        break

      case 'runCycleDone':
        this.logger?.log('debug', 'Worker run cycle done')
        this.handleRunCycle(event.data.scriptEvent)
        // Flush after each run cycle so logs are delivered to the host before
        // the next user interaction. Errors auto-flush in LogForwarder.
        this.logger?.flush()
        break

      case 'error':
        this.logger?.log('error', `Python error: ${event.data.error}`, { stack: event.data.stack })
        // error-level log auto-flushes inside LogForwarder; explicit flush
        // here ensures delivery even if the logger is replaced or overridden.
        this.logger?.flush()
        break

      default:
        this.logger?.log('warn', `Received unsupported worker event: ${eventType}`)
    }
  }

  private failureShown = false

  // The worker failed outside Python's own error handling (it could not start,
  // or crashed): tell the participant instead of leaving them on the last page,
  // and when they choose Stop end the task as incomplete (Eyra review R01;
  // nonzero exit, ADR-0039). The message stays in the page's collapsed details.
  showFailure (reason: 'start' | 'other', message: string): void {
    if (this.failureShown) return
    this.failureShown = true
    const page = {
      __type__: 'PropsUIPageDataSubmission',
      platform: 'error',
      header: { __type__: 'PropsUIHeader', title: { translations: { en: 'Something went wrong', nl: 'Er is iets misgegaan' } } },
      body: [{ __type__: 'PropsUIPageError', message, reason }]
    }
    this.commandHandler.onCommand({ __type__: 'CommandUIRender', page } as any)
      .then(async () => await this.commandHandler.onCommand({ __type__: 'CommandSystemExit', code: 1, info: 'Worker error' }))
      .then(() => {}, () => {})
  }

  start (): void {
    this.logger?.log('debug', 'Worker started')
    const waitForInitialization: Promise<void> = this.waitForInitialization()

    waitForInitialization.then(
      () => {
        this.sendSystemEvent("initialized");
        this.firstRunCycle();
      },
      () => {},
    );
  }

  async waitForInitialization(): Promise<void> {
    return await new Promise<void>((resolve) => {
      this.resolveInitialized = resolve
      this.logger?.log('debug', 'Waiting for worker initialisation')
      this.worker.postMessage({ eventType: 'initialise' })
    })
  }

  // `platform` arrives only through the constructor — App.tsx is the single source
  // (ADR-0004). There is no env fallback here: feldspar reads no build-time env of
  // its own, and a bundle built without a platform must fail loudly in Python
  // (script.py raises ValueError, surfaced through the consent-gated error page)
  // rather than be papered over by a default chosen down here.
  firstRunCycle (): void {
    this.worker.postMessage({
      eventType: 'firstRunCycle',
      data: { sessionId: this.sessionId, locale: this.locale, platform: this.platform },
    })
  }

  // A payload carried as a standalone typed array (PayloadJSON bytes from the
  // consent page) is transferred, not cloned: the mirror of py_worker.js's
  // transferablesOf. Only the payload's own buffer moves; the echoed command may
  // hold buffers the page still reads.
  nextRunCycle (response: Response): void {
    const value = (response.payload as { value?: unknown }).value
    const candidates = Array.isArray(value) ? value : [value]
    const transfer = candidates
      .filter((v): v is ArrayBufferView => ArrayBuffer.isView(v) && v.byteOffset === 0 && v.byteLength === v.buffer.byteLength)
      .map((v) => v.buffer)
    this.worker.postMessage({ eventType: 'nextRunCycle', response }, transfer)
  }

  terminate(): void {
    this.worker.terminate();
  }

  handleRunCycle(command: any): void {
    if (isCommand(command)) {
      this.commandHandler.onCommand(command).then(
        (response) => this.nextRunCycle(response),
        () => {}
      )
    }
  }
}
