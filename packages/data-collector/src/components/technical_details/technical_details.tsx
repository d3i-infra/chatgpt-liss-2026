import { JSX } from 'react'
import { ReactFactoryContext } from "@eyra/feldspar"
import { resolveText } from "../../locale/text"
import { PropsUIPromptTechnicalDetails } from "./types"

type Props = PropsUIPromptTechnicalDetails & ReactFactoryContext

// Diagnostics stay out of the participant-facing message but remain readable:
// the participant can open them before deciding whether to send an error
// report that contains them (ADR-0022). Collapsed by default.
export const TechnicalDetails = (props: Props): JSX.Element => {
  const summary = resolveText(props.summary, props.locale)

  return (
    <details className='mb-6 text-grey1'>
      <summary className='cursor-pointer font-body text-bodysmall'>{summary}</summary>
      <pre className='mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-grey4 p-3 text-xs'>
        {props.details}
      </pre>
    </details>
  )
}
