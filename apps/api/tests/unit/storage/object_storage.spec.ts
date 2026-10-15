import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import { StorageUnavailable } from '#exceptions/errors'
import { createObjectStorage } from '#services/storage/create_object_storage'
import { DisabledObjectStorage } from '#services/storage/disabled_object_storage'
import { StoredObjectMissing, StoredObjectTooLarge } from '#services/storage/object_storage'
import {
  S3ObjectStorage,
  createS3Client,
  type S3Settings,
} from '#services/storage/s3_object_storage'

const settings: S3Settings = {
  credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' }, // gitleaks:allow
  region: 'auto',
  bucket: 'receipts-test',
  endpoint: 'http://storage.test',
  forcePathStyle: true,
}

/** An S3 client whose `send` answers from `reply` and records the commands. */
function stubClient(reply: (command: any) => unknown) {
  const sent: any[] = []
  const client = {
    async send(command: any) {
      sent.push(command)
      const answer = reply(command)
      if (answer instanceof Error) throw answer
      return answer
    },
  }
  return { client: client as any, sent }
}

function s3Error(name: string, status: number) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } })
}

test.group('Object storage: S3', () => {
  test('test_presigned_put_signs_the_content_type_and_length', async ({ assert }) => {
    const storage = new S3ObjectStorage(createS3Client(settings), settings.bucket)

    const presigned = await storage.presignPut('receipts/7/photo.jpg', {
      contentType: 'image/jpeg',
      byteSize: 1234,
      expiresInSeconds: 300,
    })

    const url = new URL(presigned.url)
    assert.equal(url.origin, 'http://storage.test')
    assert.equal(url.pathname, '/receipts-test/receipts/7/photo.jpg')
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300')
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host')
    assert.isFalse(
      [...url.searchParams.keys()].some((name) => name.toLowerCase().includes('checksum')),
      'no checksum of an empty body in the URL'
    )
    assert.notInclude(presigned.url, 'test-secret-key')
    assert.deepEqual(presigned.headers, { 'Content-Type': 'image/jpeg' })
  })

  test('test_head_reports_size_and_type_or_null_when_missing', async ({ assert }) => {
    const { client, sent } = stubClient((command) =>
      command.input.Key === 'present.jpg'
        ? { ContentLength: 2048, ContentType: 'image/webp' }
        : s3Error('NotFound', 404)
    )
    const storage = new S3ObjectStorage(client, 'bucket')

    assert.deepEqual(await storage.head('present.jpg'), {
      byteSize: 2048,
      contentType: 'image/webp',
    })
    assert.isNull(await storage.head('missing.jpg'))
    assert.deepEqual(
      sent.map((command) => command.input),
      [
        { Bucket: 'bucket', Key: 'present.jpg' },
        { Bucket: 'bucket', Key: 'missing.jpg' },
      ]
    )
  })

  test('test_get_bytes_reads_the_body_within_the_limit', async ({ assert }) => {
    const { client } = stubClient(() => ({
      ContentLength: 6,
      Body: Readable.from([Buffer.from('abc'), Buffer.from('def')]),
    }))
    const storage = new S3ObjectStorage(client, 'bucket')

    const bytes = await storage.getBytes('photo.jpg', 6)

    assert.equal(bytes.toString(), 'abcdef')
  })

  test('test_get_bytes_refuses_objects_over_the_limit', async ({ assert }) => {
    const announced = stubClient(() => ({ ContentLength: 11, Body: Readable.from([]) }))
    const streamed = stubClient(() => ({
      Body: Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
    }))
    const missing = stubClient(() => s3Error('NoSuchKey', 404))

    await assert.rejects(
      () => new S3ObjectStorage(announced.client, 'b').getBytes('k', 10),
      StoredObjectTooLarge
    )
    await assert.rejects(
      () => new S3ObjectStorage(streamed.client, 'b').getBytes('k', 10),
      StoredObjectTooLarge
    )
    await assert.rejects(
      () => new S3ObjectStorage(missing.client, 'b').getBytes('k', 10),
      StoredObjectMissing
    )
  })

  test('test_storage_failures_surface_as_storage_unavailable', async ({ assert }) => {
    const { client } = stubClient(() => s3Error('InternalError', 500))
    const storage = new S3ObjectStorage(client, 'bucket')

    await assert.rejects(() => storage.head('photo.jpg'), StorageUnavailable)
    await assert.rejects(() => storage.getBytes('photo.jpg', 10), StorageUnavailable)
  })

  test('test_delete_removes_the_object', async ({ assert }) => {
    const { client, sent } = stubClient(() => ({}))
    const storage = new S3ObjectStorage(client, 'bucket')

    await storage.delete('receipts/7/photo.jpg')

    assert.equal(sent[0].constructor.name, 'DeleteObjectCommand')
    assert.deepEqual(sent[0].input, { Bucket: 'bucket', Key: 'receipts/7/photo.jpg' })
  })
})

test.group('Object storage: selection', () => {
  test('test_object_storage_is_disabled_unless_drive_disk_is_s3', async ({ assert }) => {
    assert.instanceOf(createObjectStorage('s3', settings), S3ObjectStorage)
    assert.instanceOf(createObjectStorage('fs', settings), DisabledObjectStorage)
    assert.instanceOf(createObjectStorage(undefined, settings), DisabledObjectStorage)
    assert.instanceOf(createObjectStorage('s3', { ...settings, bucket: '' }), DisabledObjectStorage)
  })

  test('test_disabled_storage_answers_storage_unavailable', async ({ assert }) => {
    const storage = new DisabledObjectStorage()

    await assert.rejects(
      () => storage.presignPut('k', { contentType: 'image/jpeg', expiresInSeconds: 60 }),
      StorageUnavailable
    )
    await assert.rejects(() => storage.head('k'), StorageUnavailable)
    await assert.rejects(() => storage.getBytes('k', 1), StorageUnavailable)
    await assert.rejects(() => storage.delete('k'), StorageUnavailable)
  })
})
