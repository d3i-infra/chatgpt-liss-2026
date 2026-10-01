// Donation payloads the UI has staged so they can be donated without a round
// trip through the worker and Python. The UI stages the serialized data and
// answers its prompt with a PayloadStagedDonation carrying only the id; the
// script then yields a CommandSystemDonate with that `staged_id`, and
// CommandRouter takes the payload out of here just before `bridge.send`.
// Each staged payload is donated at most once.

const staged = new Map<string, string>()
let counter = 0

export function stageDonation (jsonString: string): string {
  counter += 1
  const id = `staged-${counter}`
  staged.set(id, jsonString)
  return id
}

export function takeStagedDonation (id: string): string | undefined {
  const jsonString = staged.get(id)
  staged.delete(id)
  return jsonString
}
