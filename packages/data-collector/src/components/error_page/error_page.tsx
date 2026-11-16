import { ReactElement } from "react"
import { ReactFactoryContext } from "@eyra/feldspar"
import TextBundle from "@eyra/feldspar"
import { resolveText } from "../../locale/text"
import { PropsUIPageError } from "./types"

type Props = PropsUIPageError & ReactFactoryContext

// Shown when the processing worker failed outside Python's own error handling:
// it could not start, ran out of memory, or crashed. The participant learns what
// probably happened and how to try again (reload), and can stop, which ends the
// task as incomplete. Technical details stay collapsed and never leave the browser.
export const ErrorPage = (props: Props): ReactElement => {
  const { message, reason = "other", locale, resolve } = props
  const explanation = resolveText(explanations[reason] ?? explanations.other, locale)
  const stopHint = resolveText(stopHintText, locale)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-bodylarge font-body text-grey1">{explanation}</p>
      <p className="text-bodylarge font-body text-grey1">{stopHint}</p>
      {message !== "" && (
        <details className="text-bodysmall font-body text-grey2">
          <summary className="cursor-pointer">{resolveText(detailsLabel, locale)}</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-grey4 p-3 text-xs">{message}</pre>
        </details>
      )}
      <div className="flex flex-row">
        <button
          type="button"
          className="rounded bg-tertiary px-4 py-15px font-button text-button leading-none text-grey1 active:shadow-top4px"
          onClick={() => resolve?.({ __type__: "PayloadVoid", value: undefined })}
        >
          {resolveText(stopLabel, locale)}
        </button>
      </div>
    </div>
  )
}

const explanations: Record<string, TextBundle> = {
  memory: new TextBundle()
    .add("en", "Your browser ran out of memory while processing your file. Close other browser tabs and programs, then reload this page to try again. If it happens again, your file may be too large for this computer.")
    .add("nl", "Je browser had niet genoeg geheugen om je bestand te verwerken. Sluit andere browsertabbladen en programma's en laad deze pagina opnieuw om het nog eens te proberen. Gebeurt het opnieuw, dan is je bestand mogelijk te groot voor deze computer.")
    .add("de", "Ihrem Browser ist beim Verarbeiten Ihrer Datei der Speicher ausgegangen. Schließen Sie andere Browser-Tabs und Programme und laden Sie diese Seite neu, um es erneut zu versuchen. Passiert es wieder, ist Ihre Datei möglicherweise zu groß für diesen Computer.")
    .add("it", "Il suo browser ha esaurito la memoria durante l'elaborazione del file. Chiuda le altre schede del browser e i programmi, poi ricarichi questa pagina per riprovare. Se succede di nuovo, il file potrebbe essere troppo grande per questo computer.")
    .add("es", "Su navegador se ha quedado sin memoria al procesar su archivo. Cierre las demás pestañas del navegador y los programas y vuelva a cargar esta página para intentarlo de nuevo. Si vuelve a ocurrir, es posible que el archivo sea demasiado grande para este ordenador."),
  start: new TextBundle()
    .add("en", "The data donation tool could not be started. Please check your internet connection, then reload this page to try again.")
    .add("nl", "Het hulpmiddel voor het doneren van gegevens kon niet worden gestart. Controleer je internetverbinding en laad deze pagina opnieuw om het nog eens te proberen.")
    .add("de", "Das Werkzeug für die Datenspende konnte nicht gestartet werden. Bitte überprüfen Sie Ihre Internetverbindung und laden Sie diese Seite neu, um es erneut zu versuchen.")
    .add("it", "Non è stato possibile avviare lo strumento per la donazione dei dati. Controlli la connessione a Internet, poi ricarichi questa pagina per riprovare.")
    .add("es", "No se ha podido iniciar la herramienta de donación de datos. Compruebe su conexión a Internet y vuelva a cargar esta página para intentarlo de nuevo."),
  other: new TextBundle()
    .add("en", "Something went wrong while processing your file. This is not your fault. Reload this page to try again.")
    .add("nl", "Er ging iets mis bij het verwerken van je bestand. Dit ligt niet aan jou. Laad deze pagina opnieuw om het nog eens te proberen.")
    .add("de", "Bei der Verarbeitung Ihrer Datei ist etwas schiefgelaufen. Das ist nicht Ihre Schuld. Laden Sie diese Seite neu, um es erneut zu versuchen.")
    .add("it", "Si è verificato un errore durante l'elaborazione del suo file. Non è colpa sua. Ricarichi questa pagina per riprovare.")
    .add("es", "Se ha producido un error al procesar su archivo. No es culpa suya. Vuelva a cargar esta página para intentarlo de nuevo."),
}

const stopHintText = new TextBundle()
  .add("en", "If you do not want to try again, choose Stop.")
  .add("nl", "Wil je het niet opnieuw proberen, kies dan Stoppen.")
  .add("de", "Wenn Sie es nicht erneut versuchen möchten, wählen Sie Abbrechen.")
  .add("it", "Se non vuole riprovare, scelga Interrompi.")
  .add("es", "Si no quiere intentarlo de nuevo, elija Detener.")

const stopLabel = new TextBundle()
  .add("en", "Stop").add("nl", "Stoppen").add("de", "Abbrechen").add("it", "Interrompi").add("es", "Detener")

const detailsLabel = new TextBundle()
  .add("en", "Technical details").add("nl", "Technische details").add("de", "Technische Details")
  .add("it", "Dettagli tecnici").add("es", "Detalles técnicos")
