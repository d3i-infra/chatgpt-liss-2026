// Matching feldspar's Text/Translatable (duplicated like retry_prompt/types.ts).
export interface Translatable {
  translations: { [locale: string]: string }
}
export type Text = Translatable | string

// A message shown while the flow works (e.g. sends a donation in parts). Built by
// d3i_props.PropsUIPromptProgress. The page answers at once so the flow carries on
// while the message stays on screen until the next render.
export interface PropsUIPromptProgress {
  __type__: 'PropsUIPromptProgress'
  text: Text
}
