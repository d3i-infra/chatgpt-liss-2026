import CommandRouter from './command_router'
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

// The consent page donates UTF-8 bytes that travel through the worker and Python
// untouched; the host contract is still a json_string string over the bridge, and the
// Response echoed to the worker must not carry the donation again (the worker hands
// only the payload to Python, so that copy is never read).
describe('CommandRouter donations', () => {
  it('decodes a bytes donation to a string for the bridge', async () => {
    const sent: any[] = []
    const json = '{"héllo": "👋"}'
    const command = { __type__: 'CommandSystemDonate', key: 'k', json_string: new TextEncoder().encode(json) } as const
    const response = await routerWith(sent).onCommandSystem(command)
    expect(sent).toEqual([{ __type__: 'CommandSystemDonate', key: 'k', json_string: json }])
    expect(response.payload).toEqual({ __type__: 'PayloadResponse', value: { success: true, key: 'k', status: 200 } })
  })

  it('sends a string donation as is', async () => {
    const sent: any[] = []
    const command = { __type__: 'CommandSystemDonate', key: 'k', json_string: '{"a":1}' } as const
    await routerWith(sent).onCommandSystem(command)
    expect(sent).toEqual([{ __type__: 'CommandSystemDonate', key: 'k', json_string: '{"a":1}' }])
  })

  it('echoes the command to the worker without the donation', async () => {
    const sent: any[] = []
    for (const json_string of ['{"a":1}', new TextEncoder().encode('{"a":1}')]) {
      const response = await routerWith(sent).onCommandSystem({ __type__: 'CommandSystemDonate', key: 'k', json_string } as any)
      expect(response.command).toEqual({ __type__: 'CommandSystemDonate', key: 'k', json_string: '' })
    }
  })
})
