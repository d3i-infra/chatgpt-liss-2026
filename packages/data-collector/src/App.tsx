import { DataSubmissionPageFactory, ScriptHostComponent } from "@eyra/feldspar";
import { ConsentFormVizFactory } from "./factories/consent_form_viz";
import { FileInputMultipleFactory } from "./components/file_input_multiple/factory"
import { ErrorPageFactory } from "./components/error_page/factory"
import { QuestionnaireFactory } from "./components/questionnaire/factory"
import { RetryPromptFactory } from "./components/retry_prompt/factory"
import { normalizeLocale, DEFAULT_UI_LOCALE } from "./locale/policy"

// DEV-gated query param: the Playwright e2e injection point. Production locale
// comes only from mono's live-init (LiveBridge), never from the URL.
const devLocale = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('locale') ?? undefined
  : undefined

// The gh-pages preview build (VITE_STANDALONE=true) has no Next host to talk
// to, so it runs on the fake bridge like dev does. Production builds leave the
// variable unset and keep the LiveBridge.
const isPreviewBuild = import.meta.env.VITE_STANDALONE === "true"

function App() {
  return (
    <div className="App">
      <ScriptHostComponent
        workerUrl="./py_worker.js"
        standalone={import.meta.env.DEV || isPreviewBuild}
        logLevel={import.meta.env.DEV ? "debug" : "info"}
        platform={import.meta.env.VITE_PLATFORM}
        defaultLocale={DEFAULT_UI_LOCALE}
        locale={devLocale}
        mapLocale={normalizeLocale}
        factories={[
          new DataSubmissionPageFactory({
            promptFactories: [
                new ConsentFormVizFactory(),
                new FileInputMultipleFactory(),
                new ErrorPageFactory(),
                new QuestionnaireFactory(),
                new RetryPromptFactory(),
            ],
          }),
        ]}
      />
    </div>
  );
}

export default App;
