import CommandRouter from './command_router'
import { stageDonation } from './staged_donations'
import { Bridge } from './types/modules'

function routerWith (sent: any[]): CommandRouter {
  const bridge: Bridge = {
    send: async (command: any) => {
      sent.push(command)
      return { success: true, key: command.key, status: 200 }
    }
  } as any
  return new CommandRouter(bridge, {} as any)
}

describe('CommandRouter staged donations', () => {
  it('sends the staged data to the bridge and replies with the id-only command', async () => {
    const sent: any[] = []
    const id = stageDonation('{"rows": 1}')
    const command = { __type__: 'CommandSystemDonate', key: 's-chatgpt', json_string: '', staged_id: id } as const
    const response = await routerWith(sent).onCommandSystem(command)
    expect(sent).toEqual([{ __type__: 'CommandSystemDonate', key: 's-chatgpt', json_string: '{"rows": 1}' }])
    expect(response.command).toBe(command)
    expect(response.payload).toEqual({ __type__: 'PayloadResponse', value: { success: true, key: 's-chatgpt', status: 200 } })
  })

  it('donates a staged payload only once', async () => {
    const sent: any[] = []
    const id = stageDonation('x')
    const command = { __type__: 'CommandSystemDonate', key: 'k', json_string: '', staged_id: id } as const
    await routerWith(sent).onCommandSystem(command)
    const second = await routerWith(sent).onCommandSystem(command)
    expect(sent).toHaveLength(1)
    expect(second.payload).toEqual({ __type__: 'PayloadResponse', value: { success: false, key: 'k', status: 0, error: 'Staged donation not found' } })
  })

  it('sends an ordinary donation unchanged', async () => {
    const sent: any[] = []
    const command = { __type__: 'CommandSystemDonate', key: 'k', json_string: '{"a":1}' } as const
    await routerWith(sent).onCommandSystem(command)
    expect(sent).toEqual([command])
  })
})
