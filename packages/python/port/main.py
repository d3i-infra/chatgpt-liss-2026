import gc
import traceback
import json
import datetime
from collections.abc import Callable, Generator

from port.api.commands import CommandSystemExit, CommandUIRender, CommandSystemDonate
from port.api.file_utils import AsyncFileAdapter
from port.helpers import ui_locale
from port.helpers.flow_builder import TaskIncompleteError
from port.script import process
import port.api.props as props
import port.api.d3i_props as d3i_props
import port.helpers.port_helpers as ph


#: Value an error flow returns when the participant chooses to try again;
#: ScriptWrapper then restarts the script from the upload prompt.
RESTART = "restart"


def error_flow(platform: str | None, tb: str):
    """
    Generator that handles a Python exception in the donation flow.

    Yields an error page with a plain-language message and the traceback in a
    collapsed "technical details" section, then optionally donates the error
    report if the participant consents, then asks whether to try again with
    another file. Returns RESTART when they do; otherwise ends on the
    task-incomplete page.

    This is a PII safety boundary (ADR-0022): uncaught exceptions are caught
    here in Python and routed through consent-gated UI, preventing them
    from reaching the JS-side LogForwarder which would forward unsanitized
    to mono. The participant can still read the traceback (collapsed) before
    deciding whether to send it.

    Args:
        platform: Name of the active platform when the error occurred.
        tb: Full traceback string from traceback.format_exc().
    """
    header = props.PropsUIHeader(
        props.Translatable({
            "nl": "Er is iets misgegaan",
            "en": "Something went wrong",
            "de": "Es ist etwas schiefgelaufen",
            "it": "Si è verificato un errore",
            "es": "Se ha producido un error",
        })
    )
    body = [
        props.PropsUIPromptText(text=props.Translatable({
            "nl": "Er ging iets mis bij het verwerken van je bestand. Dit ligt niet aan jou. Je kunt ons een technisch rapport sturen, zodat we het probleem kunnen oplossen. Daarna kun je het opnieuw proberen met een ander bestand, of stoppen.",
            "en": "Something went wrong while processing your file. This is not your fault. You can send us a technical report so we can fix the problem. After that, you can try again with another file, or stop.",
            "de": "Bei der Verarbeitung Ihrer Datei ist etwas schiefgelaufen. Das ist nicht Ihre Schuld. Sie können uns einen technischen Bericht senden, damit wir das Problem beheben können. Danach können Sie es mit einer anderen Datei erneut versuchen oder abbrechen.",
            "it": "Si è verificato un errore durante l'elaborazione del suo file. Non è colpa sua. Può inviarci un rapporto tecnico per aiutarci a risolvere il problema. Dopodiché può riprovare con un altro file oppure interrompere.",
            "es": "Se ha producido un error al procesar su archivo. No es culpa suya. Puede enviarnos un informe técnico para que podamos solucionar el problema. Después, puede intentarlo de nuevo con otro archivo o detenerse.",
        })),
        d3i_props.PropsUIPromptTechnicalDetails(
            summary=props.Translatable({
                "nl": "Technische details (worden meegestuurd in het rapport)",
                "en": "Technical details (included in the report)",
                "de": "Technische Details (im Bericht enthalten)",
                "it": "Dettagli tecnici (inclusi nel rapporto)",
                "es": "Detalles técnicos (incluidos en el informe)",
            }),
            details=tb,
        ),
        props.PropsUIPromptConfirm(
            text=props.Translatable({
                "nl": "Wil je de fout rapporteren zodat we het probleem kunnen oplossen?",
                "en": "Would you like to report this error so we can fix the problem?",
                "de": "Möchten Sie diesen Fehler melden, damit wir das Problem beheben können?",
                "it": "Desidera segnalare questo errore in modo che possiamo risolvere il problema?",
                "es": "¿Desea informar de este error para que podamos solucionar el problema?",
            }),
            ok=props.Translatable({
                "nl": "Fout rapporteren",
                "en": "Report error",
                "de": "Fehler melden",
                "it": "Segnala errore",
                "es": "Informar del error",
            }),
            cancel=props.Translatable({
                "nl": "Overslaan",
                "en": "Skip",
                "de": "Überspringen",
                "it": "Salta",
                "es": "Omitir",
            }),
        ),
    ]
    page = props.PropsUIPageDataSubmission(platform or "error", header, body)
    consent_result = yield CommandUIRender(page)

    if consent_result is not None and getattr(consent_result, "__type__", None) == "PayloadTrue":
        error_data = json.dumps({
            "platform": platform,
            "traceback": tb,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
        yield CommandSystemDonate("error-report", error_data)

    retry_result = yield ph.render_page(
        props.Translatable({
            "nl": "Opnieuw proberen?",
            "en": "Try again?",
            "de": "Erneut versuchen?",
            "it": "Riprovare?",
            "es": "¿Intentar de nuevo?",
        }),
        props.PropsUIPromptConfirm(
            text=props.Translatable({
                "nl": "Wil je het opnieuw proberen met een ander bestand?",
                "en": "Would you like to try again with another file?",
                "de": "Möchten Sie es mit einer anderen Datei erneut versuchen?",
                "it": "Desidera riprovare con un altro file?",
                "es": "¿Desea intentarlo de nuevo con otro archivo?",
            }),
            ok=props.Translatable({
                "nl": "Opnieuw proberen",
                "en": "Try again",
                "de": "Erneut versuchen",
                "it": "Riprova",
                "es": "Intentar de nuevo",
            }),
            cancel=props.Translatable({
                "nl": "Stoppen",
                "en": "Stop",
                "de": "Abbrechen",
                "it": "Interrompi",
                "es": "Detener",
            }),
        ),
    )
    if retry_result is not None and getattr(retry_result, "__type__", None) == "PayloadTrue":
        return RESTART

    # Terminal task-incomplete page: without it the participant would be left
    # on the stale error page after the nonzero exit halts the run cycle
    # (#123). Its Confirm must resolve so the generator can exhaust (ADR-0025).
    yield ph.render_task_incomplete_page(platform or "error")


def too_large_flow(platform: str | None):
    """Handler for a MemoryError (Eyra review R01): the export is too large for
    this browser, which is not a bug, so there is no error report. Choose a file
    again (returns RESTART) or stop (task-incomplete page; the wrapper exits with
    the upload-rejected code, ADR-0039)."""
    page = ph.render_page(ph.TOO_LARGE_HEADER, ph.generate_too_large_prompt(platform or "data"))
    choice = yield page
    if getattr(choice, "__type__", None) == "PayloadTrue":
        return RESTART
    yield ph.render_task_incomplete_page(platform or "error")


def incomplete_flow(platform: str | None):
    """Terminal handler for TaskIncompleteError: a flow that ended without
    completion but with nothing to report — no error-report consent step.

    Resolvable pre-exit acknowledgment (ADR-0039); must never become an
    unresolved end page (the ADR-0025 EndPage hang).
    """
    yield ph.render_task_incomplete_page(platform or "error")


class ScriptWrapper(Generator):
    def __init__(self, script, platform: str | None = None, restart: Callable[[], Generator] | None = None):
        self.script = script
        self.platform = platform or "unknown"
        # Zero-argument factory for a fresh script, used when the participant
        # chooses "try again" after an error (error_flow returns RESTART).
        self._restart = restart
        self._reset_handler()

    def _reset_handler(self):
        self._error_handler = None
        # (code, info) for the terminal exit once a handler flow exhausts.
        # Defaults are the error-flow pair; TaskIncompleteError overrides
        # them with its own category (ADR-0039).
        self._exit_code = 1
        self._exit_info = "Error flow completed"

    def send(self, data):
        if self._error_handler is not None:
            try:
                command = self._error_handler.send(data)
                return command.toDict()
            except StopIteration as stop:
                if stop.value == RESTART and self._restart is not None:
                    # Start over from the upload prompt with a fresh script.
                    self.script = self._restart()
                    self._reset_handler()
                    return self._advance_script(None)
                # Handler-end, not flow-end: a nonzero code tells the host the
                # task was NOT completed (Issue #123). The info string crosses
                # the bridge unconsented and must stay free of exception text
                # (ADR-0022/0023).
                return CommandSystemExit(self._exit_code, self._exit_info).toDict()

        # Automatically wrap JS file readers with AsyncFileAdapter
        if data and getattr(data, "__type__", None) == "PayloadFile":
            data.value = AsyncFileAdapter(data.value)
        elif data and getattr(data, "__type__", None) == "PayloadFiles":
            data.value = [AsyncFileAdapter(reader) for reader in data.value]

        return self._advance_script(data)

    def _advance_script(self, data):
        try:
            command = self.script.send(data)
            # If the script yields None (e.g. bare `yield` used as a checkpoint),
            # continue the generator immediately with None so the next step runs.
            while command is None:
                command = self.script.send(None)
        except StopIteration:
            return CommandSystemExit(0, "End of script").toDict()
        except MemoryError:
            return self._start_too_large()
        except TaskIncompleteError as e:
            # The flow declared itself incomplete (abandoned, upload
            # rejected, donation failed). No error to report — go straight
            # to the task-incomplete page, then exit with the flow's own
            # fixed (code, info) pair.
            self._exit_code = e.exit_code
            self._exit_info = e.exit_info
            self._error_handler = incomplete_flow(self.platform)
            command = next(self._error_handler)
            return command.toDict()
        except Exception:
            tb = traceback.format_exc()
            self._error_handler = error_flow(self.platform, tb)
            command = next(self._error_handler)
            return command.toDict()

        try:
            return command.toDict()
        except MemoryError:
            # Converting a large page (the review tables) is where Eyra's run
            # failed (R01). Drop it and the suspended script, then explain.
            del command
            self.script.close()
            return self._start_too_large()

    def _start_too_large(self):
        gc.collect()
        self._exit_code, self._exit_info = TaskIncompleteError.EXITS["upload_rejected"]
        self._error_handler = too_large_flow(self.platform)
        return next(self._error_handler).toDict()

    def throw(self, _type=None, _value=None, _traceback=None):
        raise StopIteration


def start(data):
    """Entry from py_worker.js.

    `data` is the #960-style context dict {"sessionId", "locale", "platform"}
    posted by WorkerProcessingEngine.firstRunCycle. sessionId arrives as a JSON
    string (Assembly builds it with String(Date.now())), so downstream
    donation-key logic (ADR-0020) always sees str.
    """
    session_id = data.get("sessionId")
    platform = data.get("platform")
    ui_locale.set_ui_locale(data.get("locale"))
    script = process(session_id, platform)
    return ScriptWrapper(script, platform=platform, restart=lambda: process(session_id, platform))
