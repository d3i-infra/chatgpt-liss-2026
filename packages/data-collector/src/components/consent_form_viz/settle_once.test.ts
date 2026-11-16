import { claimOnce } from './settle_once'

describe('claimOnce', () => {
  it('lets only the first activation through', () => {
    const claim = { current: false }
    const encode = jest.fn()
    const handleDonate = (): void => { if (!claimOnce(claim)) return; encode() }
    const handleCancel = (): void => { if (!claimOnce(claim)) return; encode() }

    handleDonate()
    handleDonate()
    handleCancel()
    expect(encode).toHaveBeenCalledTimes(1)
  })
})
