import { useEffect } from "react"
import { ReactFactoryContext } from "@eyra/feldspar"
import { resolveText } from "../../locale/text"
import { PropsUIPromptProgress } from "./types"

type Props = Omit<PropsUIPromptProgress, "__type__"> & ReactFactoryContext

export const Progress = ({ text, locale, resolve }: Props) => {
  // Answer as soon as the message is on screen: the flow's next command (e.g. the
  // next donation part) runs while this page stays visible.
  useEffect(() => {
    resolve?.({ __type__: "PayloadVoid", value: undefined })
  }, [resolve])

  return (
    <div className="flex flex-row items-center gap-4" role="status" aria-live="polite">
      <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-4 border-grey4 border-t-primary" aria-hidden="true" />
      <div className="text-bodylarge font-body text-grey1">{resolveText(text, locale)}</div>
    </div>
  )
}
