// Matching feldspar's Text/Translatable (duplicated like retry_prompt/types.ts
// to keep this component self-contained — feldspar doesn't export these types).
export interface Translatable {
  translations: { [locale: string]: string }
}
export type Text = Translatable | string

// Collapsed technical details (e.g. a traceback) under a participant-facing
// message. Built by d3i_props.PropsUIPromptTechnicalDetails.
export interface PropsUIPromptTechnicalDetails {
  __type__: 'PropsUIPromptTechnicalDetails'
  summary: Text
  details: string
}
