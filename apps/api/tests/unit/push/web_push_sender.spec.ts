import webpush from 'web-push'
import { test } from '@japa/runner'
import { createServer, type Server, type Socket } from 'node:net'
import WebPushSender from '#services/push/web_push_sender'

const PAYLOAD = {
  title: 'Did you log anything today?',
  body: 'b',
  url: '/add',
  tag: 'daily-reminder',
}
const KEYS = {
  p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  auth: 'tBHItJI5svbpez7KI4CCXg',
}

function vapid() {
  const pair = webpush.generateVAPIDKeys()
  return { details: async () => ({ subject: 'mailto:push@example.test', ...pair }) }
}

/** A "push service" that accepts the connection and never says a word (a tarpit). */
async function tarpit(): Promise<{ server: Server; port: number; sockets: Set<Socket> }> {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('no port')
  return { server, port: address.port, sockets }
}

test.group('WebPushSender', () => {
  test('test_an_endpoint_outside_the_push_services_is_never_contacted', async ({ assert }) => {
    const sender = new WebPushSender(vapid())

    const delivery = await sender.send(
      { endpoint: 'https://169.254.169.254/latest/meta-data/', ...KEYS },
      PAYLOAD,
      { ttlSeconds: 60, signal: new AbortController().signal }
    )

    assert.deepEqual(delivery, {
      status: 'failed',
      error: 'E_PUSH_ENDPOINT: not a known push service',
      statusCode: null,
    })
  })

  test('test_a_send_aborted_at_its_deadline_settles_at_once_as_a_failure', async ({
    assert,
    cleanup,
  }) => {
    const { server, port, sockets } = await tarpit()
    cleanup(() => {
      for (const socket of sockets) socket.destroy()
      server.close()
    })
    /** Lets the local tarpit through, as if it were a push service. */
    class TarpitSender extends WebPushSender {
      protected override allows() {
        return true
      }
    }
    const deadline = new AbortController()
    const started = Date.now()

    const sending = new TarpitSender(vapid()).send(
      { endpoint: `https://127.0.0.1:${port}/send/1`, ...KEYS },
      PAYLOAD,
      { ttlSeconds: 60, signal: deadline.signal }
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(sockets.size, 1, 'connected and waiting')
    deadline.abort()
    const delivery = await sending

    assert.deepEqual(delivery, {
      status: 'failed',
      error: 'E_PUSH_TIMEOUT: dropped at the deadline',
      statusCode: null,
    })
    assert.isBelow(Date.now() - started, 1_500, 'never waits for the 10 s socket timeout')
  })
})
