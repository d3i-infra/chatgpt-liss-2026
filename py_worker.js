let pyScript;

console.log("[ProcessingWorker] Worker loaded");

onmessage = (event) => {
  // Log types only: payloads include the participant's data (the consent
  // tables, the donation), and logging them stringifies or retains full copies.
  console.log("[ProcessingWorker] Received event: " + event.data.eventType);
  const { eventType } = event.data;
  switch (eventType) {
    case "initialise":
      initialise().then(() => {
        self.postMessage({ eventType: "initialiseDone" });
      });
      break;

    case "firstRunCycle": {
      const ctx = event.data.data;
      // strip null/undefined/"undefined": the JSON text is interpolated as a Python
      // literal and values must stay strings/numbers (JSON null is not Python)
      for (const k of Object.keys(ctx)) if (ctx[k] == null || ctx[k] === "undefined") delete ctx[k];
      pyScript = self.pyodide.runPython(`port.start(${JSON.stringify(ctx)})`);
      runCycle(null);
      break;
    }

    case "nextRunCycle":
      const { response } = event.data;
      unwrap(response).then((userInput) => {
        runCycle(userInput);
      });
      break;

    default:
      console.log("[ProcessingWorker] Received unsupported event: ", eventType);
  }
};

function runCycle(payload) {
  console.log("[ProcessingWorker] runCycle " + (payload && payload.__type__));
  let scriptEvent;
  try {
    scriptEvent = pyScript.send(payload);
  } catch (error) {
    // Local diagnostics only — escaped Python errors reach the participant
    // as a rendered error page (ADR-0022); never posted as error/log events
    // that would forward unconsented traceback text (ADR-0023).
    console.error("[ProcessingWorker] Error in pyScript.send:", error);
    self.postMessage({
      eventType: "runCycleDone",
      scriptEvent: generateErrorMessage(String(error)),
    });
    return;
  }
  try {
    const event = scriptEvent.toJs({
      create_proxies: false,
      dict_converter: Object.fromEntries,
    });
    // Release the Python-side command (and the bytes it holds) now rather
    // than whenever the proxy is finalized, so Pyodide can reuse that memory.
    scriptEvent.destroy();
    // Move large byte payloads (a consent table's data_frame, see
    // d3i_props.translate_data_frame) to the page instead of copying them.
    self.postMessage({ eventType: "runCycleDone", scriptEvent: event }, transferablesOf(event));
  } catch (error) {
    console.error("[ProcessingWorker] Error in toJs/postMessage:", error);
    self.postMessage({
      eventType: "runCycleDone",
      scriptEvent: generateErrorMessage(String(error)),
    });
  }
}

// ArrayBuffers of standalone typed arrays anywhere in a converted command.
// A view into Pyodide's own WASM memory is never transferred: that would
// detach the heap under the running interpreter.
function transferablesOf(value) {
  const heap = self.pyodide._module.HEAPU8.buffer;
  const found = new Set();
  const visit = (v) => {
    if (v === null || typeof v !== "object") return;
    if (ArrayBuffer.isView(v)) {
      if (v.buffer !== heap && v.byteOffset === 0 && v.byteLength === v.buffer.byteLength) found.add(v.buffer);
      return;
    }
    for (const item of Array.isArray(v) ? v : Object.values(v)) visit(item);
  };
  visit(value);
  return [...found];
}

function generateErrorMessage(message) {
  return {
    __type__: "CommandUIRender",
    page: {
      __type__: "PropsUIPageDataSubmission",
      platform: "error",
      header: {
        __type__: "PropsUIHeader",
        title: { translations: { nl: "Er is iets misgegaan", en: "Something went wrong" } },
      },
      body: [
        {
          __type__: "PropsUIPageError",
          message: message,
        },
      ],
    },
  };
}

function unwrap(response) {
  console.log("[ProcessingWorker] unwrap response: " + response.payload.__type__);
  return new Promise((resolve) => {
    switch (response.payload.__type__) {
      case "PayloadFile":
        copyFileToPyFS(response.payload.value, resolve);
        break;

      case "PayloadFiles":
        resolve({
          __type__: "PayloadFiles",
          value: response.payload.value.map(createAsyncFileReader),
        });
        break;

      default:
        resolve(response.payload);
    }
  });
}

function createAsyncFileReader(file) {
  // Use FileReaderSync for synchronous reading in worker
  const fileReaderSync = new FileReaderSync();

  return {
    readSlice: (start, end) => {
      // Synchronous slice reading
      const blob = file.slice(start, end);
      return fileReaderSync.readAsArrayBuffer(blob);
    },
    size: file.size,
    name: file.name,
  };
}

function copyFileToPyFS(file, resolve) {
  const reader = createAsyncFileReader(file);
  resolve({
    __type__: "PayloadFile",
    value: reader,
  });
}

function initialise() {
  console.log("[ProcessingWorker] initialise");
  return startPyodide()
    .then((pyodide) => {
      self.pyodide = pyodide;
      return loadPackages();
    })
    .then(() => {
      return installPortPackage();
    });
}

function startPyodide() {
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.0/full/pyodide.js");

  console.log("[ProcessingWorker] loading Pyodide");
  return loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.0/full/",
  });
}

function loadPackages() {
  console.log("[ProcessingWorker] loading packages");
  return self.pyodide.loadPackage(["micropip", "numpy", "pandas", "lxml"]);
}

function installPortPackage() {
  console.log("[ProcessingWorker] load port package");
  return self.pyodide.runPythonAsync(`
    import micropip
    await micropip.install("./port-0.0.0-py3-none-any.whl", deps=False)
    import port
  `);
}
