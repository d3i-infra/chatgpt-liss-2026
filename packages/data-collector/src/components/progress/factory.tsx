import { PromptFactory, ReactFactoryContext } from "@eyra/feldspar"
import { Progress } from "./progress"
import { PropsUIPromptProgress } from "./types"

export class ProgressFactory implements PromptFactory {
  create(body: unknown, context: ReactFactoryContext) {
    if (this.isBody(body)) {
      return <Progress {...body} {...context} />
    }
    return null
  }

  private isBody(body: unknown): body is PropsUIPromptProgress {
    return (body as PropsUIPromptProgress).__type__ === "PropsUIPromptProgress"
  }
}
