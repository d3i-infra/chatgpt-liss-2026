import logging
from typing import Any, cast

import port.api.d3i_props as d3i_props
import port.api.props as props
from port.api.commands import CommandSystemDonate, CommandSystemExit, CommandSystemLog, CommandUIRender

#: Error-counter keys for data left out of the tables because it could not be
#: read. Extractors count skips under these keys; the participant is told
#: before review (omitted_data_notice) and the counts are donated with each
#: table's "extraction errors" (Eyra review R03).
SKIPPED_FILE = "SkippedFile"
SKIPPED_CONVERSATION = "SkippedConversation"
SKIPPED_MESSAGE = "SkippedMessage"

#: Donated with the table when the export was larger than the donation budget
#: (size_cap.py, ADR-0048): conversations left out and included, the budget in
#: MB, and the date (YYYYMMDD) from which conversations are included.
SIZE_CAP_LEFT_OUT = "SizeCapLeftOutConversations"
SIZE_CAP_INCLUDED = "SizeCapIncludedConversations"
SIZE_CAP_BUDGET_MB = "SizeCapBudgetMB"
SIZE_CAP_INCLUDED_FROM = "SizeCapIncludedFrom"

_MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    "nl": ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    "de": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    "it": ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
}

_SKIPPED_LABELS = {
    SKIPPED_FILE: {
        "en": "Files or file parts", "nl": "Bestanden of bestandsdelen", "de": "Dateien oder Dateiteile",
        "it": "File o parti di file", "es": "Archivos o partes de archivos",
    },
    SKIPPED_CONVERSATION: {
        "en": "Conversations", "nl": "Gesprekken", "de": "Unterhaltungen",
        "it": "Conversazioni", "es": "Conversaciones",
    },
    SKIPPED_MESSAGE: {
        "en": "Messages", "nl": "Berichten", "de": "Nachrichten",
        "it": "Messaggi", "es": "Mensajes",
    },
}

_logger = logging.getLogger(__name__)


def render_page(
    header_text: props.Translatable,
    body: (
        props.PropsUIPromptRadioInput
        | props.PropsUIPromptConsentForm
        | d3i_props.PropsUIPromptConsentFormViz
        | props.PropsUIPromptFileInput
        | d3i_props.PropsUIPromptFileInputMultiple
        | d3i_props.PropsUIPromptQuestionnaire
        | props.PropsUIPromptConfirm
    ),
) -> CommandUIRender:
    """
    Renders the UI components for a donation page.

    This function assembles various UI components including a header, body, and footer
    to create a complete donation page. It uses the provided header text and body content
    to customize the page.

    Args:
        header_text (props.Translatable): The text to be displayed in the header.
            This should be a translatable object to support multiple languages.
        body (
            props.PropsUIPromptRadioInput |
            props.PropsUIPromptConsentForm |
            props.PropsUIPromptFileInput |
            props.PropsUIPromptConfirm |
        ): The main content of the page. It must be compatible with `props.PropsUIPageDonation`.

    Returns:
        CommandUIRender: A render command object containing the fully assembled page. Must be yielded.
    """
    header = props.PropsUIHeader(header_text)
    page = props.PropsUIPageDataSubmission("does not matter", header, body)
    return CommandUIRender(page)


def generate_retry_prompt(platform_name: str, multiple: bool = False) -> props.PropsUIPromptConfirm:
    """
    Generate a multilingual retry prompt for file processing errors.

    Returns a PropsUIPromptConfirm with "Try again" (ok → PayloadTrue) and
    "Continue" (cancel → PayloadFalse) buttons. Using standard feldspar
    PropsUIPromptConfirm instead of d3i PropsUIPromptRetry which only
    renders a single button. See ADR-0016 for the broader
    decision on custom vs standard prompt components.

    Args:
        platform_name: The name of the platform whose file could not be processed.
        multiple (bool, optional): Whether the upload this retries is a
            multi-file (PayloadFiles) selection — mirrors generate_file_prompt's
            `multiple` flag. When True, the retry copy tells the participant to
            select ALL the files again, since a multi-part upload (e.g. Google
            Takeout) must be resubmitted as a complete set, not one part.
            Defaults to False.
    """

    if multiple:
        text = props.Translatable(
            {
                "en": f"Unfortunately, we cannot process your {platform_name} files. Continue, if you are sure that you selected the right files. Try again to select ALL the files.",
                "nl": f"Helaas, kunnen we uw {platform_name} bestanden niet verwerken. Weet u zeker dat u de juiste bestanden heeft gekozen? Ga dan verder. Probeer opnieuw om ALLE bestanden te selecteren.",
                "de": f"Leider können wir Ihre {platform_name}-Dateien nicht verarbeiten. Fahren Sie fort, wenn Sie sicher sind, dass Sie die richtigen Dateien ausgewählt haben. Versuchen Sie es erneut, um ALLE Dateien auszuwählen.",
                "it": f"Purtroppo non possiamo elaborare i suoi file di {platform_name}. Continui se è sicuro di aver selezionato i file giusti. Riprovi per selezionare TUTTI i file.",
                "es": f"Lamentablemente, no podemos procesar sus archivos de {platform_name}. Continúe si está seguro de que ha seleccionado los archivos correctos. Intente de nuevo para seleccionar TODOS los archivos.",
            }
        )
    else:
        text = props.Translatable(
            {
                "en": f"Unfortunately, we cannot process your {platform_name} file. Continue, if you are sure that you selected the right file. Try again to select a different file.",
                "nl": f"Helaas, kunnen we je {platform_name} bestand niet verwerken. Weet je zeker dat je het juiste bestand hebt gekozen? Ga dan verder. Probeer opnieuw als je een ander bestand wilt kiezen.",
                "de": f"Leider können wir Ihre {platform_name}-Datei nicht verarbeiten. Fahren Sie fort, wenn Sie sicher sind, dass Sie die richtige Datei ausgewählt haben. Versuchen Sie es erneut, um eine andere Datei auszuwählen.",
                "it": f"Purtroppo non possiamo elaborare il suo file di {platform_name}. Continui se è sicuro di aver selezionato il file giusto. Riprovi per selezionare un file diverso.",
                "es": f"Lamentablemente, no podemos procesar su archivo de {platform_name}. Continúe si está seguro de que ha seleccionado el archivo correcto. Intente de nuevo para seleccionar un archivo diferente.",
            }
        )
    ok = props.Translatable(
        {"en": "Try again", "nl": "Probeer opnieuw", "de": "Erneut versuchen", "it": "Riprova", "es": "Intentar de nuevo"}
    )
    cancel = props.Translatable(
        {"en": "Continue", "nl": "Doorgaan", "de": "Weiter", "it": "Continua", "es": "Continuar"}
    )
    return props.PropsUIPromptConfirm(text, ok, cancel)


TOO_LARGE_HEADER = props.Translatable({
    "en": "Your file is too large",
    "nl": "Je bestand is te groot",
    "de": "Ihre Datei ist zu groß",
    "it": "Il suo file è troppo grande",
    "es": "Su archivo es demasiado grande",
})


def generate_too_large_prompt(platform_name: str) -> props.PropsUIPromptConfirm:
    """Prompt shown when processing ran out of memory (Eyra review R01): the file
    is not damaged, it is too large for this browser right now. Choose a file
    again (ok → PayloadTrue) or stop (cancel → PayloadFalse). Fixed copy only."""
    text = props.Translatable({
        "en": f"Your {platform_name} file is too large to process in this browser: it ran out of memory. Close other browser tabs and programs and try again, or use a computer with more memory. You can choose a file again, or stop.",
        "nl": f"Je {platform_name} bestand is te groot om in deze browser te verwerken: het geheugen raakte vol. Sluit andere browsertabbladen en programma's en probeer het opnieuw, of gebruik een computer met meer geheugen. Je kunt opnieuw een bestand kiezen, of stoppen.",
        "de": f"Ihre {platform_name}-Datei ist zu groß, um in diesem Browser verarbeitet zu werden: Der Speicher ist voll. Schließen Sie andere Browser-Tabs und Programme und versuchen Sie es erneut, oder verwenden Sie einen Computer mit mehr Arbeitsspeicher. Sie können erneut eine Datei auswählen oder abbrechen.",
        "it": f"Il suo file di {platform_name} è troppo grande per essere elaborato in questo browser: la memoria si è esaurita. Chiuda le altre schede del browser e i programmi e riprovi, oppure usi un computer con più memoria. Può scegliere di nuovo un file oppure interrompere.",
        "es": f"Su archivo de {platform_name} es demasiado grande para procesarlo en este navegador: se ha agotado la memoria. Cierre las demás pestañas del navegador y los programas e inténtelo de nuevo, o utilice un ordenador con más memoria. Puede volver a elegir un archivo o detenerse.",
    })
    ok = props.Translatable({
        "en": "Choose a file again",
        "nl": "Opnieuw een bestand kiezen",
        "de": "Erneut eine Datei auswählen",
        "it": "Scegli di nuovo un file",
        "es": "Volver a elegir un archivo",
    })
    cancel = props.Translatable({"en": "Stop", "nl": "Stoppen", "de": "Abbrechen", "it": "Interrompi", "es": "Detener"})
    return props.PropsUIPromptConfirm(text, ok, cancel)


def generate_unreadable_file_prompt(platform_name: str, multiple: bool = False) -> props.PropsUIPromptConfirm:
    """Prompt shown when a valid-looking file yields no data because reading
    it failed (e.g. a truncated or invalid conversations file).

    Distinct from the no-data acknowledgment (ADR-0019): the participant is
    told the file could not be read and may choose another file
    (ok → PayloadTrue) or stop (cancel → PayloadFalse). Fixed copy only — no
    exception text reaches the page (ADR-0022/0023).
    """
    if multiple:
        text = props.Translatable({
            "en": f"We could not read the data in your {platform_name} files. The files may be incomplete or damaged. You can choose the files again (for example from a new export), or stop.",
            "nl": f"We konden de gegevens in je {platform_name} bestanden niet lezen. De bestanden zijn mogelijk onvolledig of beschadigd. Je kunt de bestanden opnieuw kiezen (bijvoorbeeld uit een nieuwe export), of stoppen.",
            "de": f"Wir konnten die Daten in Ihren {platform_name}-Dateien nicht lesen. Die Dateien sind möglicherweise unvollständig oder beschädigt. Sie können die Dateien erneut auswählen (zum Beispiel aus einem neuen Export) oder abbrechen.",
            "it": f"Non siamo riusciti a leggere i dati nei suoi file di {platform_name}. I file potrebbero essere incompleti o danneggiati. Può selezionare di nuovo i file (ad esempio da una nuova esportazione) oppure interrompere.",
            "es": f"No hemos podido leer los datos de sus archivos de {platform_name}. Es posible que los archivos estén incompletos o dañados. Puede volver a seleccionar los archivos (por ejemplo, de una nueva exportación) o detenerse.",
        })
        ok = props.Translatable({
            "en": "Choose files again",
            "nl": "Bestanden opnieuw kiezen",
            "de": "Dateien erneut auswählen",
            "it": "Seleziona di nuovo i file",
            "es": "Volver a seleccionar archivos",
        })
    else:
        text = props.Translatable({
            "en": f"We could not read the data in your {platform_name} file. The file may be incomplete or damaged. You can choose another file (for example a new export), or stop.",
            "nl": f"We konden de gegevens in je {platform_name} bestand niet lezen. Het bestand is mogelijk onvolledig of beschadigd. Je kunt een ander bestand kiezen (bijvoorbeeld een nieuwe export), of stoppen.",
            "de": f"Wir konnten die Daten in Ihrer {platform_name}-Datei nicht lesen. Die Datei ist möglicherweise unvollständig oder beschädigt. Sie können eine andere Datei auswählen (zum Beispiel einen neuen Export) oder abbrechen.",
            "it": f"Non siamo riusciti a leggere i dati nel suo file di {platform_name}. Il file potrebbe essere incompleto o danneggiato. Può scegliere un altro file (ad esempio una nuova esportazione) oppure interrompere.",
            "es": f"No hemos podido leer los datos de su archivo de {platform_name}. Es posible que el archivo esté incompleto o dañado. Puede elegir otro archivo (por ejemplo, una nueva exportación) o detenerse.",
        })
        ok = props.Translatable({
            "en": "Choose another file",
            "nl": "Ander bestand kiezen",
            "de": "Andere Datei auswählen",
            "it": "Scegli un altro file",
            "es": "Elegir otro archivo",
        })
    cancel = props.Translatable({"en": "Stop", "nl": "Stoppen", "de": "Abbrechen", "it": "Interrompi", "es": "Detener"})
    return props.PropsUIPromptConfirm(text, ok, cancel)


def generate_file_prompt(
    extensions: str, multiple: bool = False
) -> props.PropsUIPromptFileInput | d3i_props.PropsUIPromptFileInputMultiple:
    """
    Generates a file input prompt for selecting file(s) for a platform.

    Creates a multilingual file input prompt that instructs the user to select
    file(s) they've received from a platform and stored on their device.
    The returned prompt is rendered with: yield result = render_page(...)

    When returned, result.value contains the file handle(s):
    - If multiple=False: a single file, wrapped as PayloadFile
    - If multiple=True: a list of files, wrapped as PayloadFiles

    Args:
        extensions (str): A collection of allowed MIME types.
            For example: "application/zip, text/plain, application/json"
        multiple (bool, optional): Whether to allow multiple file selection.
            Defaults to False.

    Returns:
        props.PropsUIPromptFileInput | d3i_props.PropsUIPromptFileInputMultiple:
            A file input prompt object containing the description text and
            allowed file extensions. If multiple=True, returns a
            PropsUIPromptFileInputMultiple object for selecting multiple files.
    """
    # de/it/nl copy below: register standardized on formal Lei (it), Download-Anleitung
    # unified (de), Dutch compounds per Taalunie (nl) — reviewed 2026-08-27.
    description = props.Translatable(
        {
            "en": "Please follow the download instructions and choose the file that you stored on your device.",
            "nl": "Volg de downloadinstructies en kies het bestand dat je op je apparaat hebt opgeslagen.",
            "de": "Bitte folgen Sie der Download-Anleitung und wählen Sie die Datei aus, die Sie auf Ihrem Gerät gespeichert haben.",
            "it": "Segua le istruzioni per il download e scelga il file che ha salvato sul suo dispositivo.",
            "es": "Siga las instrucciones de descarga y elija el archivo que ha guardado en su dispositivo.",
        }
    )
    if multiple:
        description = props.Translatable({
            "en": "Please follow the download instructions and select ALL the files you received — Google Takeout usually delivers several zip files that belong together.",
            "nl": "Volg de downloadinstructies en selecteer ALLE bestanden die u heeft ontvangen — Google Takeout levert meestal meerdere zipbestanden die bij elkaar horen.",
            "de": "Bitte folgen Sie der Download-Anleitung und wählen Sie ALLE erhaltenen Dateien aus — Google Takeout liefert meist mehrere zusammengehörige ZIP-Dateien.",
            "it": "Segua le istruzioni per il download e selezioni TUTTI i file ricevuti — Google Takeout di solito fornisce più file ZIP appartenenti alla stessa esportazione.",
            "es": "Siga las instrucciones de descarga y seleccione TODOS los archivos recibidos — Google Takeout suele entregar varios archivos zip que van juntos.",
        })
        # Keeps the filename portion identical across locales — only the
        # leading "Example"/"Voorbeeld"/... word is translated — matching
        # the Google Takeout chunked-export naming shape (see ADR-0040).
        example = props.Translatable({
            "en": "Example: takeout-...-1-001.zip, takeout-...-2-001.zip",
            "nl": "Voorbeeld: takeout-...-1-001.zip, takeout-...-2-001.zip",
            "de": "Beispiel: takeout-...-1-001.zip, takeout-...-2-001.zip",
            "it": "Esempio: takeout-...-1-001.zip, takeout-...-2-001.zip",
            "es": "Ejemplo: takeout-...-1-001.zip, takeout-...-2-001.zip",
        })
        return d3i_props.PropsUIPromptFileInputMultiple(description, extensions, example=example)

    return props.PropsUIPromptFileInput(description, extensions)


def omitted_data_notice(errors) -> props.Translatable | None:
    """Plain-language notice listing what could not be read, or None when
    nothing was skipped. Counts only — never exception or participant text."""
    counts = [(key, errors.get(key, 0)) for key in _SKIPPED_LABELS]
    counts = [(key, n) for key, n in counts if n > 0]
    if not counts:
        return None
    intro = {
        "en": "Not everything in your file could be read. The following could not be read, so it is not shown below and will not be shared:",
        "nl": "Niet alles in je bestand kon worden gelezen. Het volgende kon niet worden gelezen. Het staat daarom niet hieronder en wordt niet gedeeld:",
        "de": "Nicht alles in Ihrer Datei konnte gelesen werden. Folgendes konnte nicht gelesen werden und wird daher unten nicht angezeigt und nicht geteilt:",
        "it": "Non è stato possibile leggere tutto il contenuto del suo file. Quanto segue non è stato letto, quindi non è mostrato qui sotto e non verrà condiviso:",
        "es": "No se ha podido leer todo el contenido de su archivo. Lo siguiente no se ha podido leer, por lo que no se muestra a continuación y no se compartirá:",
    }
    translations = {
        lang: "\n".join([text] + [f"• {_SKIPPED_LABELS[key][lang]}: {n}" for key, n in counts])
        for lang, text in intro.items()
    }
    return props.Translatable(cast(props.Translations, translations))


def _long_date(yyyymmdd: int, lang: str) -> str:
    year, month, day = yyyymmdd // 10000, yyyymmdd // 100 % 100, yyyymmdd % 100
    if not 1 <= month <= 12:
        return str(yyyymmdd)
    name = _MONTHS[lang][month - 1]
    return f"{name} {day}, {year}" if lang == "en" else f"{day} {name} {year}"


def size_cap_notice(errors) -> props.Translatable | None:
    """Plain-language notice that only the most recent conversations are included
    because the export is too large, or None when nothing was left out."""
    left_out = errors.get(SIZE_CAP_LEFT_OUT, 0)
    if not left_out:
        return None
    included = errors.get(SIZE_CAP_INCLUDED, 0)
    since = errors.get(SIZE_CAP_INCLUDED_FROM)
    texts = {}
    for lang in _MONTHS:
        date = _long_date(since, lang) if since else None
        texts[lang] = {
            "en": f"Your export is too large to share completely. Only your {included} most recent conversations are shown below and can be shared"
                  + (f" (those with activity on or after {date})" if date else "")
                  + f". {left_out} older conversations are left out and will not be shared.",
            "nl": f"Je export is te groot om helemaal te delen. Alleen je {included} meest recente gesprekken staan hieronder en kunnen worden gedeeld"
                  + (f" (gesprekken met activiteit op of na {date})" if date else "")
                  + f". {left_out} oudere gesprekken zijn weggelaten en worden niet gedeeld.",
            "de": f"Ihr Export ist zu groß, um ihn vollständig zu teilen. Nur Ihre {included} neuesten Unterhaltungen werden unten angezeigt und können geteilt werden"
                  + (f" (mit Aktivität am oder nach dem {date})" if date else "")
                  + f". {left_out} ältere Unterhaltungen werden weggelassen und nicht geteilt.",
            "it": f"La sua esportazione è troppo grande per essere condivisa per intero. Qui sotto sono mostrate, e possono essere condivise, solo le sue {included} conversazioni più recenti"
                  + (f" (con attività dal {date} in poi)" if date else "")
                  + f". {left_out} conversazioni meno recenti sono escluse e non verranno condivise.",
            "es": f"Su exportación es demasiado grande para compartirla por completo. Solo se muestran a continuación, y se pueden compartir, sus {included} conversaciones más recientes"
                  + (f" (con actividad a partir del {date})" if date else "")
                  + f". Se omiten {left_out} conversaciones más antiguas, que no se compartirán.",
        }[lang]
    return props.Translatable(cast(props.Translations, texts))


#: From this share of the donation budget on, the review page asks the participant
#: to close other tabs: other tabs share the browser's memory, and a large
#: donation leaves little room for them (ADR-0048). Smaller donations never see it.
LARGE_DONATION_FRACTION = 0.5


def close_tabs_notice() -> props.Translatable:
    return props.Translatable({
        "en": "Your data is large. Before you share it, close other browser tabs and programs you do not need, and keep this tab open until sending is complete.",
        "nl": "Je gegevens zijn groot. Sluit voordat je ze deelt andere browsertabbladen en programma's die je niet nodig hebt, en houd dit tabblad open tot het versturen klaar is.",
        "de": "Ihre Daten sind umfangreich. Schließen Sie vor dem Teilen andere Browser-Tabs und Programme, die Sie nicht brauchen, und lassen Sie diesen Tab geöffnet, bis das Senden abgeschlossen ist.",
        "it": "I suoi dati sono di grandi dimensioni. Prima di condividerli, chiuda le altre schede del browser e i programmi che non le servono, e tenga aperta questa scheda fino al termine dell'invio.",
        "es": "Sus datos son grandes. Antes de compartirlos, cierre las demás pestañas del navegador y los programas que no necesite, y mantenga abierta esta pestaña hasta que termine el envío.",
    })


def review_notice(errors, large_donation: bool = False) -> props.Translatable | None:
    """The review page's notice: what was left out for size, the advice to close
    other tabs (only for a large donation), then what could not be read; None
    when none applies."""
    candidates = (size_cap_notice(errors), close_tabs_notice() if large_donation else None, omitted_data_notice(errors))
    parts = [n for n in candidates if n is not None]
    if not parts:
        return None
    langs = parts[0].toDict()["translations"].keys()
    joined = {lang: "\n\n".join(p.toDict()["translations"].get(lang, "") for p in parts) for lang in langs}
    return props.Translatable(cast(props.Translations, joined))


def generate_review_data_prompt(
    description: props.Translatable,
    table_list: list[d3i_props.PropsUIPromptConsentFormTableViz],
    notice: props.Translatable | None = None,
) -> d3i_props.PropsUIPromptConsentFormViz:
    """
    Generates a data review form with a list of tables and a description, including default donate question and button.
    The participant can review these tables before they will be send to the researcher. If the participant consents to sharing the data
    the data will be stored at the configured storage location.

    Args:
        table_list (list[props.PropsUIPromptConsentFormTableViz]): A list of consent form tables to be included in the prompt.
        description (props.Translatable): A translatable description text for the consent prompt.
        notice (props.Translatable | None): Optional highlighted notice, e.g. that some data could not be read.

    Returns:
        props.PropsUIPromptConsentForm: A structured consent form object containing the provided table list, description,
        and default values for donate question and button.
    """
    donate_question = props.Translatable(
        {
            "en": "Do you want to share this data for research?",
            "nl": "Wil je deze gegevens delen voor onderzoek?",
            "de": "Möchten Sie diese Daten für die Forschung teilen?",
            "it": "Vuole condividere questi dati per la ricerca?",
            "es": "¿Desea compartir estos datos para la investigación?",
        }
    )

    donate_button = props.Translatable(
        {
            "en": "Yes, share for research",
            "nl": "Ja, deel voor onderzoek",
            "de": "Ja, für Forschung teilen",
            "it": "Sì, condividi per la ricerca",
            "es": "Sí, compartir para la investigación",
        }
    )

    return d3i_props.PropsUIPromptConsentFormViz(
        tables=table_list, description=description, donate_question=donate_question, donate_button=donate_button,
        notice=notice,
    )


def donate(key: str, json_string: Any) -> CommandSystemDonate:
    """
    Initiates a donation process using the provided key and data.

    This function triggers the donation process by passing a key and a JSON-formatted string
    that contains donation information.

    Args:
        key (str): The key associated with the donation process. The key will be used in the file name.
        json_string: The donated JSON as a str, or as UTF-8 bytes (the JsProxy of the
            consent page's Uint8Array, passed through untouched; ADR-0046).

    Returns:
        CommandSystemDonate: A system command that initiates the donation process. Must be yielded.
    """
    return CommandSystemDonate(key, json_string)


def exit(code: int, info: str) -> CommandSystemExit:
    """
    Exits Next with the provided exit code and additional information.
    This if the code reaches this function, it will return to the task list in Next.

    Args:
        code (int): The exit code representing the type or status of the exit.
        info (str): A string containing additional information about the exit.

    Returns:
        CommandSystemExit: A system command that initiates the exit process in Next.

    Examples::

        yield exit(0, "Success")
    """
    return CommandSystemExit(code, info)


def emit_log(level: str, message: str):
    """Yield a CommandSystemLog to the host via the command protocol.

    Use via `yield from emit_log(...)` in generators (FlowBuilder, script.py).
    The host receives the log immediately; the PayloadVoid response is discarded.

    Messages sent through this function reach mono's /api/feldspar/log.
    They MUST be PII-free — no file paths, exception text, or participant data.

    Examples::

        yield from emit_log("info", "[LinkedIn] Consent: accepted")
        yield from emit_log("info", "Starting platform: Facebook")
    """
    _ = yield CommandSystemLog(level=level, message=message)


def generate_radio_prompt(
    title: props.Translatable, description: props.Translatable, items: list[str]
) -> props.PropsUIPromptRadioInput:
    """
    General purpose prompt selection menu
    """
    radio_items: list[props.RadioItem] = [{"id": i, "value": item} for i, item in enumerate(items)]
    return props.PropsUIPromptRadioInput(title, description, radio_items)


def generate_questionnaire() -> d3i_props.PropsUIPromptQuestionnaire:
    """
    Administer a basic questionnaire in Port.

    This function generates a prompt which can be rendered with render_page().
    The questionnaire demonstrates all currently implemented question types.
    In the current implementation, all questions are optional.

    You can build in logic by:
    - Chaining questionnaires together
    - Using extracted data in your questionnaires

    Usage:
        prompt = generate_questionnaire()
        results = yield render_page(header_text, prompt)

    The results.value contains a JSON string with question answers that
    can then be donated with donate().
    """

    questionnaire_description = props.Translatable(
        translations={
            "en": "Customer Satisfaction Survey for our Online Store",
            "nl": "Klanttevredenheidsonderzoek voor onze Online Winkel",
            "de": "Kundenzufriedenheitsumfrage für unseren Online-Shop",
            "it": "Sondaggio sulla soddisfazione dei clienti per il nostro negozio online",
            "es": "Encuesta de satisfacción del cliente para nuestra tienda en línea",
        }
    )

    open_question = props.Translatable(
        translations={
            "en": "How can we improve our services?",
            "nl": "Hoe kunnen we onze diensten verbeteren?",
            "de": "Wie können wir unsere Dienstleistungen verbessern?",
            "it": "Come possiamo migliorare i nostri servizi?",
            "es": "¿Cómo podemos mejorar nuestros servicios?",
        }
    )

    mc_question = props.Translatable(
        translations={
            "en": "How would you rate your overall experience?",
            "nl": "Hoe zou u uw algemene ervaring beoordelen?",
            "de": "Wie würden Sie Ihre Gesamterfahrung bewerten?",
            "it": "Come valuterebbe la sua esperienza complessiva?",
            "es": "¿Cómo valoraría su experiencia general?",
        }
    )

    mc_choices = [
        props.Translatable(
            translations={"en": "Excellent", "nl": "Uitstekend", "de": "Ausgezeichnet", "it": "Eccellente", "es": "Excelente"}
        ),
        props.Translatable(translations={"en": "Good", "nl": "Goed", "de": "Gut", "it": "Buono", "es": "Bueno"}),
        props.Translatable(
            translations={"en": "Average", "nl": "Gemiddeld", "de": "Durchschnittlich", "it": "Nella media", "es": "Regular"}
        ),
        props.Translatable(translations={"en": "Poor", "nl": "Slecht", "de": "Schlecht", "it": "Scarso", "es": "Malo"}),
        props.Translatable(
            translations={"en": "Very Poor", "nl": "Zeer slecht", "de": "Sehr schlecht", "it": "Molto scarso", "es": "Muy malo"}
        ),
    ]

    checkbox_question = props.Translatable(
        translations={
            "en": "Which of our products have you purchased? (Select all that apply)",
            "nl": "Welke van onze producten heeft u gekocht? (Selecteer alle toepasselijke)",
            "de": "Welche unserer Produkte haben Sie gekauft? (Wählen Sie alle zutreffenden aus)",
            "it": "Quali dei nostri prodotti ha acquistato? (Selezioni tutte le opzioni pertinenti)",
            "es": "¿Cuáles de nuestros productos ha comprado? (Seleccione todas las opciones que correspondan)",
        }
    )

    checkbox_choices = [
        props.Translatable(
            translations={"en": "Electronics", "nl": "Elektronica", "de": "Elektronik", "it": "Elettronica", "es": "Electrónica"}
        ),
        props.Translatable(
            translations={"en": "Clothing", "nl": "Kleding", "de": "Kleidung", "it": "Abbigliamento", "es": "Ropa"}
        ),
        props.Translatable(
            translations={
                "en": "Home Goods",
                "nl": "Huishoudelijke artikelen",
                "de": "Haushaltswaren",
                "it": "Articoli per la casa",
                "es": "Artículos para el hogar",
            }
        ),
        props.Translatable(translations={"en": "Books", "nl": "Boeken", "de": "Bücher", "it": "Libri", "es": "Libros"}),
        props.Translatable(
            translations={
                "en": "Food Items",
                "nl": "Voedingsproducten",
                "de": "Lebensmittel",
                "it": "Alimentari",
                "es": "Alimentos",
            }
        ),
    ]

    open_ended_question = d3i_props.PropsUIQuestionOpen(id=1, question=open_question)

    multiple_choice_question = d3i_props.PropsUIQuestionMultipleChoice(id=2, question=mc_question, choices=mc_choices)

    checkbox_question_obj = d3i_props.PropsUIQuestionMultipleChoiceCheckbox(
        id=3, question=checkbox_question, choices=checkbox_choices
    )

    return d3i_props.PropsUIPromptQuestionnaire(
        description=questionnaire_description, questions=[multiple_choice_question, checkbox_question_obj, open_ended_question]
    )


def render_no_data_page(platform_name: str) -> CommandUIRender:
    """Render 'no relevant data found' with acknowledge button.

    Caller should yield and await response before returning.
    """
    header = props.PropsUIHeader(
        props.Translatable({
            "en": f"No data found",
            "nl": f"Geen gegevens gevonden",
            "de": "Keine Daten gefunden",
            "it": "Nessun dato trovato",
            "es": "No se han encontrado datos",
        })
    )
    body = props.PropsUIPromptConfirm(
        text=props.Translatable({
            "en": f"Unfortunately, no relevant data was found in your {platform_name} file.",
            "nl": f"Helaas zijn er geen relevante gegevens gevonden in je {platform_name} bestand.",
            "de": f"Leider wurden in Ihrer {platform_name}-Datei keine relevanten Daten gefunden.",
            "it": f"Purtroppo non sono stati trovati dati rilevanti nel suo file di {platform_name}.",
            "es": f"Lamentablemente, no se han encontrado datos relevantes en su archivo de {platform_name}.",
        }),
        ok=props.Translatable({"en": "Continue", "nl": "Doorgaan", "de": "Weiter", "it": "Continua", "es": "Continuar"}),
    )
    page = props.PropsUIPageDataSubmission(platform_name, header, body)
    return CommandUIRender(page)


def render_safety_error_page(platform_name: str, error: Exception) -> CommandUIRender:
    """Render file safety error page.

    Terminal page: FlowBuilder discards this Confirm's result and always
    raises TaskIncompleteError("upload_rejected") next, regardless of which
    button is pressed (start_flow's safety-check branch). A second button
    with the same effect would only invent a distinction that isn't there,
    so this is a single acknowledging button (no `cancel`) — see the
    task-incomplete page for the same pattern.

    Caller should yield and await response before returning.
    """
    header = props.PropsUIHeader(
        props.Translatable({
            "en": "File cannot be processed",
            "nl": "Bestand kan niet worden verwerkt",
            "de": "Datei kann nicht verarbeitet werden",
            "it": "Impossibile elaborare il file",
            "es": "No se puede procesar el archivo",
        })
    )
    body = props.PropsUIPromptConfirm(
        text=props.Translatable({
            "en": f"Your {platform_name} file could not be processed: {error}",
            "nl": f"Je {platform_name} bestand kon niet worden verwerkt: {error}",
            "de": f"Ihre {platform_name}-Datei konnte nicht verarbeitet werden: {error}",
            "it": f"Non è stato possibile elaborare il suo file di {platform_name}: {error}",
            "es": f"No se ha podido procesar su archivo de {platform_name}: {error}",
        }),
        ok=props.Translatable({"en": "OK", "nl": "OK", "de": "OK", "it": "OK", "es": "OK"}),
    )
    page = props.PropsUIPageDataSubmission(platform_name, header, body)
    return CommandUIRender(page)


def render_task_incomplete_page(platform_name: str) -> CommandUIRender:
    """Render the terminal page of the error flow: the task was not completed
    and the participant can retry by refreshing the page.

    Shown after the consent-gated error report (or its skip) so the
    participant does not land on a stale error page when the flow exits
    nonzero (Issue #123). Caller should yield and await response before
    returning.
    """
    header = props.PropsUIHeader(
        props.Translatable({
            "en": "Task not completed",
            "nl": "Taak niet voltooid",
            "de": "Aufgabe nicht abgeschlossen",
            "it": "Attività non completata",
            "es": "Tarea no completada",
        })
    )
    body = props.PropsUIPromptConfirm(
        text=props.Translatable({
            "en": "This task could not be completed. You can try again by refreshing this page. If the problem persists, please contact the researcher.",
            "nl": "Deze taak kon niet worden voltooid. Je kunt het opnieuw proberen door deze pagina te vernieuwen. Als het probleem aanhoudt, neem dan contact op met de onderzoeker.",
            "de": "Diese Aufgabe konnte nicht abgeschlossen werden. Sie können es erneut versuchen, indem Sie diese Seite aktualisieren. Wenn das Problem weiterhin besteht, wenden Sie sich bitte an den Forscher.",
            "it": "Non è stato possibile completare questa attività. Può riprovare aggiornando questa pagina. Se il problema persiste, contatti il ricercatore.",
            "es": "Esta tarea no se pudo completar. Puede intentarlo de nuevo actualizando esta página. Si el problema persiste, póngase en contacto con el investigador.",
        }),
        ok=props.Translatable({"en": "OK", "nl": "OK", "de": "OK", "it": "OK", "es": "OK"}),
    )
    page = props.PropsUIPageDataSubmission(platform_name, header, body)
    return CommandUIRender(page)


#: Largest part a donation is sent in. Each part is its own request to the host,
#: under its own key, so neither the browser nor Next ever handles the whole
#: donation in one request (ADR-0047; Eyra review R01/R02).
DONATION_CHUNK_BYTES = d3i_props.DONATE_PART_BYTES


def donation_chunk_bounds(data, chunk_bytes: int | None = None) -> list[tuple[int, int]]:
    """Split a donation into ``(start, end)`` ranges of at most ``chunk_bytes``.

    ``data`` is the UTF-8 bytes the consent page donates (a JsProxy of a
    Uint8Array in Pyodide, or ``bytes``) or a ``str``. Bytes are never cut
    inside a character: a part ends before a UTF-8 continuation byte, so every
    part decodes on its own and the parts concatenate to the original text.
    """
    if chunk_bytes is None:
        chunk_bytes = DONATION_CHUNK_BYTES
    total = len(data)
    if total <= chunk_bytes:
        return [(0, total)]
    is_text = isinstance(data, str)
    bounds = []
    start = 0
    while start < total:
        end = min(start + chunk_bytes, total)
        if not is_text:
            while start < end < total and 0x80 <= data[end] <= 0xBF:
                end -= 1
        bounds.append((start, end))
        start = end
    return bounds


def donation_chunk(data, start: int, end: int):
    """One part of a donation. For the page's bytes this is a new standalone
    Uint8Array (``slice``, not ``subarray``): the worker can then transfer it,
    whereas a view would be cloned together with the whole donation."""
    if isinstance(data, (str, bytes)):
        return data[start:end]
    return data.slice(start, end)


def is_part_list(data) -> bool:
    """True for a donation already split into parts: the consent page's list of
    Uint8Arrays (a JsProxy of a JS Array in Pyodide), or a Python list."""
    if isinstance(data, (list, tuple)):
        return True
    if isinstance(data, (str, bytes)):
        return False
    try:
        import js  # pyright: ignore[reportMissingModuleSource]

        return js.Array.isArray(data) is True
    except Exception:
        return False


def donation_parts(data):
    """``(number of parts, iterator over the parts)`` of a donation.

    The consent page sends its parts ready-made; each is passed on untouched, and
    leaves the worker when its donate command is transferred to the page. Any other
    donation (a str, or one bytes object) is split here with donation_chunk_bounds.
    """
    if is_part_list(data):
        return len(data), _page_parts(data)
    bounds = donation_chunk_bounds(data)
    if len(bounds) == 1:
        return 1, iter([data])
    return len(bounds), (donation_chunk(data, start, end) for start, end in bounds)


def _page_parts(data):
    for i in range(len(data)):
        yield data[i]
        # Asked for the next part, so this one was delivered: release it.
        data[i] = None


def sendable_copy(part):
    """What a donate command carries: for the page's bytes a copy (``slice``), so
    the part itself stays in the worker until the host confirms it and can be sent
    again if it fails. The copy is transferred to the page; the cost is one part."""
    if isinstance(part, (str, bytes)):
        return part
    return part.slice()


def donation_size(data) -> int:
    """Total donated bytes (characters for a str), without converting anything."""
    return sum(len(part) for part in data) if is_part_list(data) else len(data)


def donation_part_key(key: str, part: int, total: int) -> str:
    """The key of one part. Without a hyphen, so parsers that read the platform
    after the last hyphen (ADR-0020) see ``chatgpt_part2of7``."""
    return key if total == 1 else f"{key}_part{part}of{total}"


def render_donation_retry_page(platform_name: str, part: int, total: int) -> CommandUIRender:
    """A part could not be sent (also after an automatic retry): try again or stop.
    Parts already sent stay sent; trying again resumes at this part."""
    header = props.PropsUIHeader(props.Translatable({
        "en": "Sending did not work",
        "nl": "Versturen is niet gelukt",
    }))
    if total == 1:
        text = {
            "en": "Your data could not be sent. Please check your internet connection and try again.",
            "nl": "Je gegevens konden niet worden verstuurd. Controleer je internetverbinding en probeer het opnieuw.",
        }
    else:
        text = {
            "en": f"Part {part} of {total} could not be sent. Please check your internet connection and try again. The parts already sent are kept.",
            "nl": f"Deel {part} van {total} kon niet worden verstuurd. Controleer je internetverbinding en probeer het opnieuw. De delen die al zijn verstuurd, blijven bewaard.",
        }
    body = props.PropsUIPromptConfirm(
        text=props.Translatable(cast(props.Translations, text)),
        ok=props.Translatable({"en": "Try again", "nl": "Opnieuw proberen"}),
        cancel=props.Translatable({"en": "Stop", "nl": "Stoppen"}),
    )
    return CommandUIRender(props.PropsUIPageDataSubmission(platform_name, header, body))


def render_donation_progress_page(platform_name: str, part: int, total: int) -> CommandUIRender:
    """Shown while a donation is sent; answers at once (PropsUIPromptProgress)."""
    header = props.PropsUIHeader(props.Translatable({
        "en": "Sending your data",
        "nl": "Je gegevens worden verstuurd",
    }))
    if total == 1:
        text = props.Translatable({
            "en": "Your data is being sent. Please keep this page open.",
            "nl": "Je gegevens worden verstuurd. Houd deze pagina open.",
        })
    else:
        text = props.Translatable({
            "en": f"Sending part {part} of {total}. This can take a few minutes. Please keep this page open.",
            "nl": f"Deel {part} van {total} wordt verstuurd. Dit kan een paar minuten duren. Houd deze pagina open.",
        })
    page = props.PropsUIPageDataSubmission(platform_name, header, d3i_props.PropsUIPromptProgress(text=text))
    return CommandUIRender(page)


def render_donate_failure_page(platform_name: str) -> CommandUIRender:
    """Render donation failure page.

    Terminal page: FlowBuilder discards this Confirm's result and always
    raises TaskIncompleteError("donation_failed") next, regardless of which
    button is pressed (start_flow's donate-result branch) — donation is
    never retried from here. A second button with the same effect would
    only invent a distinction that isn't there, so this is a single
    acknowledging button (no `cancel`) — see the task-incomplete page for
    the same pattern.

    Caller should yield and await response before returning.
    """
    header = props.PropsUIHeader(
        props.Translatable({
            "en": "Data submission failed",
            "nl": "Gegevensinzending mislukt",
            "de": "Datenübermittlung fehlgeschlagen",
            "it": "Invio dei dati non riuscito",
            "es": "Error al enviar los datos",
        })
    )
    body = props.PropsUIPromptConfirm(
        text=props.Translatable({
            "en": f"Unfortunately, your {platform_name} data could not be submitted. Please try again later.",
            "nl": f"Helaas konden je {platform_name} gegevens niet worden ingediend. Probeer het later opnieuw.",
            "de": f"Leider konnten Ihre {platform_name}-Daten nicht übermittelt werden. Bitte versuchen Sie es später erneut.",
            "it": f"Purtroppo non è stato possibile inviare i suoi dati di {platform_name}. Riprovi più tardi.",
            "es": f"Lamentablemente, no se han podido enviar sus datos de {platform_name}. Inténtelo de nuevo más tarde.",
        }),
        ok=props.Translatable({"en": "OK", "nl": "OK", "de": "OK", "it": "OK", "es": "OK"}),
    )
    page = props.PropsUIPageDataSubmission(platform_name, header, body)
    return CommandUIRender(page)


def render_protocol_error_page(platform_name: str) -> CommandUIRender:
    """Shown when the UI returned a payload type the flow cannot process —
    version skew between the study page and the flow, never participant data.

    Caller should yield and await response before returning. Distinct from
    the participant-skip case: a mismatched or unrecognized `__type__` is
    an observable protocol error, not a silent skip. See ADR-0018/0026 for
    the accepted upload payload shapes.

    Terminal page: FlowBuilder discards this Confirm's result and always
    raises TaskIncompleteError("upload_rejected") next, regardless of which
    button is pressed (start_flow's protocol-mismatch branch). A second
    button with the same effect would only invent a distinction that isn't
    there, so this is a single acknowledging button (no `cancel`) — see the
    task-incomplete page for the same pattern.
    """
    header = props.Translatable({
        "en": "Something went wrong",
        "nl": "Er ging iets mis",
        "de": "Etwas ist schiefgelaufen",
        "it": "Qualcosa è andato storto",
        "es": "Algo salió mal",
    })
    body = props.PropsUIPromptConfirm(
        text=props.Translatable({
            "en": f"The study page and the {platform_name} flow are out of sync. Please close this window and try again later.",
            "nl": f"De studiepagina en de {platform_name}-flow lopen niet gelijk. Sluit dit venster en probeer het later opnieuw.",
            "de": f"Die Studienseite und der {platform_name}-Ablauf sind nicht mehr synchron. Bitte schließen Sie dieses Fenster und versuchen Sie es später erneut.",
            "it": f"La pagina dello studio e il flusso di {platform_name} non sono sincronizzati. Chiuda questa finestra e riprovi più tardi.",
            "es": f"La página del estudio y el flujo de {platform_name} no están sincronizados. Cierre esta ventana e inténtelo de nuevo más tarde.",
        }),
        ok=props.Translatable({"en": "OK", "nl": "OK", "de": "OK", "it": "OK", "es": "OK"}),
    )
    return render_page(header, body)


def handle_donate_result(result) -> bool:
    """Inspect donate result. Returns True on success, False on failure.

    Both current bridges acknowledge a CommandSystemDonate with a structured
    result, so production and local dev alike reach Python as PayloadResponse:
    LiveBridge relays the host's reply, and FakeBridge returns the outcome of
    its own /data-submission POST. PayloadVoid arrives only from a bridge that
    resolves a donate without an acknowledgment (an older host, a stub bridge).

    PayloadResponse → check value.success (the path every current bridge takes)
    PayloadVoid / None → True (legacy no-acknowledgment shape)
    Anything else → log warning, return False
    """
    if result is None:
        return True

    result_type = getattr(result, "__type__", None)

    if result_type == "PayloadResponse":
        # value is { success: bool, key: str, status: int, error?: str }
        return bool(result.value.success)

    if result_type == "PayloadVoid":
        return True

    _logger.warning("Unexpected donate result type: %s", result_type)
    return False
