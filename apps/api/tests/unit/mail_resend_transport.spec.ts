import { test } from '@japa/runner'
import User from '#models/user'
import type { AddressInfo } from 'node:net'
import VerifyEmailMail from '#mails/verify_email_mail'
import { ResendTransport } from '@adonisjs/mail/transports/resend'
import { createServer, type IncomingMessage, type Server } from 'node:http'

/** What the fake Resend API received. */
interface ResendCall {
  method?: string
  path?: string
  authorization?: string
  body: Record<string, unknown>
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** A local stand-in for the Resend `/emails` API, so the test never reaches the network. */
async function fakeResend(calls: ResendCall[]): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (request, response) => {
    calls.push({
      method: request.method,
      path: request.url,
      authorization: request.headers.authorization,
      body: await readJson(request),
    })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ id: 'resend-message-1' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

/**
 * The production mailer is the Resend transport of @adonisjs/mail, which
 * builds the message with nodemailer (raised to a patched major through the
 * root `overrides`) before posting it. This sends a real app mail through it
 * end to end, against a local fake of the API.
 */
test.group('Mail: Resend transport', () => {
  test('test_resend_transport_posts_an_app_mail_to_the_emails_endpoint', async ({
    assert,
    cleanup,
  }) => {
    const calls: ResendCall[] = []
    const { server, baseUrl } = await fakeResend(calls)
    cleanup(() => new Promise<void>((resolve) => server.close(() => resolve())))

    const user = new User().merge({
      email: 'someone@example.test',
      fullName: 'Sam Example',
      locale: 'en',
    })
    const mail = new VerifyEmailMail(
      user,
      'https://app.example.test/verify-email?token=t',
      '123456'
    )
    mail.message.from('noreply@mail.example.test', 'monkimoney')
    await mail.build()

    const transport = new ResendTransport({ key: 're_test_key', baseUrl })
    const response = await transport.send(mail.message.toObject().message)

    assert.lengthOf(calls, 1)
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].path, '/emails')
    assert.equal(calls[0].authorization, 'Bearer re_test_key')
    assert.equal(calls[0].body.from, 'monkimoney <noreply@mail.example.test>')
    assert.deepEqual(calls[0].body.to, ['someone@example.test'])
    assert.isString(calls[0].body.subject)
    assert.include(calls[0].body.text as string, '123456')
    assert.equal(response.messageId, 'resend-message-1')
  })
})
