import { test } from '@japa/runner'
import { zipStream } from '#domain/export/zip'
import { unzip } from '#tests/helpers/zip'

async function collect(chunks: AsyncIterable<Buffer>) {
  const parts: Buffer[] = []
  for await (const chunk of chunks) parts.push(chunk)
  return Buffer.concat(parts)
}

async function* lines(count: number) {
  for (let index = 0; index < count; index++) yield `row ${index},ñandú\r\n`
}

test.group('Export: ZIP', () => {
  test('test_zip_holds_every_entry_with_its_exact_content', async ({ assert }) => {
    const archive = await collect(
      zipStream(
        [
          { name: 'accounts.csv', content: ['\uFEFFid,name\r\n', '1,Everyday\r\n'] },
          { name: 'empty.csv', content: [] },
          { name: 'ledger.csv', content: lines(5_000) },
        ],
        new Date('2026-10-16T09:30:00Z')
      )
    )

    const files = unzip(archive)
    assert.deepEqual([...files.keys()], ['accounts.csv', 'empty.csv', 'ledger.csv'])
    assert.equal(files.get('accounts.csv'), '\uFEFFid,name\r\n1,Everyday\r\n')
    assert.equal(files.get('empty.csv'), '')
    const ledger = files.get('ledger.csv')!
    assert.isTrue(ledger.startsWith('row 0,ñandú\r\nrow 1,ñandú\r\n'))
    assert.isTrue(ledger.endsWith('row 4999,ñandú\r\n'))
    // Deflated: repetitive CSV shrinks a lot.
    assert.isBelow(archive.length, Buffer.byteLength(ledger) / 5)
  })

  test('test_zip_marks_names_as_utf8_and_dates_entries', async ({ assert }) => {
    const archive = await collect(
      zipStream([{ name: 'año.csv', content: ['x'] }], new Date('2026-10-16T09:30:10Z'))
    )

    // Local header: general purpose flags (data descriptor + UTF-8 names),
    // deflate, DOS time 09:30:10 and date 2026-10-16.
    assert.equal(archive.readUInt32LE(0), 0x04034b50)
    assert.equal(archive.readUInt16LE(6), 0x0808)
    assert.equal(archive.readUInt16LE(8), 8)
    assert.equal(archive.readUInt16LE(10), (9 << 11) | (30 << 5) | 5)
    assert.equal(archive.readUInt16LE(12), ((2026 - 1980) << 9) | (10 << 5) | 16)
    assert.deepEqual([...unzip(archive).keys()], ['año.csv'])
  })

  test('test_zip_streams_entries_lazily', async ({ assert }) => {
    const opened: string[] = []
    async function* table(name: string) {
      opened.push(name)
      yield `${name}\r\n`
    }
    async function* entries() {
      yield { name: 'a.csv', content: table('a') }
      yield { name: 'b.csv', content: table('b') }
    }

    const chunks = zipStream(entries())[Symbol.asyncIterator]()
    await chunks.next()

    // Only the first entry's header is out: nothing was read yet.
    assert.deepEqual(opened, [])
    const rest: Buffer[] = []
    for (let chunk = await chunks.next(); !chunk.done; chunk = await chunks.next()) {
      rest.push(chunk.value)
    }
    assert.deepEqual(opened, ['a', 'b'])
  })

  test('test_zip_fails_when_an_entry_fails', async ({ assert }) => {
    async function* broken() {
      yield 'first line\r\n'
      throw new Error('database went away')
    }

    await assert.rejects(
      () => collect(zipStream([{ name: 'broken.csv', content: broken() }])),
      'database went away'
    )
  })
})
