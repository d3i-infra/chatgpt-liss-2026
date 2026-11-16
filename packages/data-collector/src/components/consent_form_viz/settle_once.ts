// The review page answers the flow exactly once (Eyra review R07). Donate and
// Cancel both claim it first; a second activation, e.g. a double click before
// the spinner covers the button, does nothing and encodes no second copy of the
// donation.
export interface Claim { current: boolean }

export function claimOnce (claim: Claim): boolean {
  if (claim.current) return false
  claim.current = true
  return true
}
