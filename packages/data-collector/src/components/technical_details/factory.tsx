import {
    PromptFactory,
    ReactFactoryContext
} from "@eyra/feldspar"
import { TechnicalDetails } from "./technical_details"
import { PropsUIPromptTechnicalDetails } from "./types"

export class TechnicalDetailsFactory implements PromptFactory {
  create(body: unknown, context: ReactFactoryContext) {
    if (this.isBody(body)) {
      return <TechnicalDetails {...body} {...context} />;
    }
    return null;
  }

  private isBody(body: unknown): body is PropsUIPromptTechnicalDetails {
    return (
      (body as PropsUIPromptTechnicalDetails).__type__ === "PropsUIPromptTechnicalDetails"
    );
  }
}
