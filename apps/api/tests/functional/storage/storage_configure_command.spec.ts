import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import app from '@adonisjs/core/services/app'
import StorageConfigure from '#commands/storage_configure'
import { ObjectStorage } from '#services/storage/object_storage'
import { S3ObjectStorage } from '#services/storage/s3_object_storage'

/** .env.test APP_URL. */
const APP_ORIGIN = 'http://127.0.0.1:3333'

const R2_DEFAULT_RULE = {
  ID: 'Default Multipart Abort Rule',
  Status: 'Enabled',
  Filter: { Prefix: '' },
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
}

function s3Error(name: string, status: number) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } })
}

/**
 * A bucket behind a stubbed S3 client: answers the Get* commands from
 * `state`, stores what the Put* commands send, and records every command.
 */
function stubBucket(options: { corsSupported?: boolean } = {}) {
  const state = {
    cors: null as unknown[] | null,
    lifecycle: [R2_DEFAULT_RULE] as unknown[],
  }
  const sent: Array<{ name: string; input: any }> = []
  const client = {
    async send(command: any) {
      const name = command.constructor.name
      sent.push({ name, input: command.input })
      switch (name) {
        case 'GetBucketCorsCommand':
          if (!state.cors) throw s3Error('NoSuchCORSConfiguration', 404)
          return { CORSRules: state.cors }
        case 'PutBucketCorsCommand':
          if (options.corsSupported === false) throw s3Error('NotImplemented', 501)
          state.cors = command.input.CORSConfiguration.CORSRules
          return {}
        case 'GetBucketLifecycleConfigurationCommand':
          return { Rules: state.lifecycle }
        case 'PutBucketLifecycleConfigurationCommand':
          state.lifecycle = command.input.LifecycleConfiguration.Rules
          return {}
        default:
          throw new Error(`unexpected ${name}`)
      }
    },
  }
  app.container.swap(ObjectStorage, () => new S3ObjectStorage(client as any, 'receipts-bucket'))
  return { state, sent, puts: () => sent.filter((command) => command.name.startsWith('Put')) }
}

async function run(...args: string[]) {
  const command = await ace.create(StorageConfigure, args)
  await command.exec()
  return command
}

test.group('Storage: storage:configure command', (group) => {
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    return () => {
      ace.ui.switchMode('normal')
      app.container.restore(ObjectStorage)
    }
  })

  test('test_storage_configure_applies_cors_and_receipt_expiry', async ({ assert }) => {
    const bucket = stubBucket()

    const command = await run()

    command.assertSucceeded()
    assert.deepEqual(
      bucket.puts().map((put) => put.name),
      ['PutBucketCorsCommand', 'PutBucketLifecycleConfigurationCommand']
    )
    assert.deepEqual(bucket.state.cors, [
      {
        AllowedOrigins: [APP_ORIGIN],
        AllowedMethods: ['PUT'],
        AllowedHeaders: ['Content-Type'],
        MaxAgeSeconds: 3600,
      },
    ])
    assert.deepEqual(bucket.state.lifecycle, [
      R2_DEFAULT_RULE,
      {
        ID: 'expire-receipts',
        Status: 'Enabled',
        Filter: { Prefix: 'receipts/' },
        Expiration: { Days: 1 },
      },
    ])
    assert.isTrue(bucket.sent.every((sent) => sent.input.Bucket === 'receipts-bucket'))
    command.assertLogMatches(/receipts-bucket/)
    command.assertLogMatches(/expire-receipts/)
    command.assertLogMatches(new RegExp(APP_ORIGIN.replaceAll('.', '\\.')))
  })

  test('test_storage_configure_is_idempotent', async ({ assert }) => {
    const bucket = stubBucket()

    await run()
    const first = structuredClone(bucket.state)
    const again = await run()

    again.assertSucceeded()
    assert.deepEqual(bucket.state, first)
  })

  test('test_storage_configure_dry_run_changes_nothing', async ({ assert }) => {
    const bucket = stubBucket()

    const command = await run('--dry-run')

    command.assertSucceeded()
    assert.deepEqual(bucket.puts(), [])
    command.assertLogMatches(/expire-receipts/)
    command.assertLogMatches(/dry run/i)
  })

  test('test_storage_configure_skips_cors_where_the_storage_lacks_it', async ({ assert }) => {
    // MinIO answers NotImplemented to bucket CORS (it allows every origin).
    const bucket = stubBucket({ corsSupported: false })

    const command = await run()

    command.assertSucceeded()
    assert.equal(bucket.state.lifecycle.length, 2)
    command.assertLogMatches(/CORS/)
  })

  test('test_storage_configure_needs_an_s3_bucket', async () => {
    // Tests run with DRIVE_DISK=fs: the configured storage is the disabled one.
    const command = await run()

    command.assertFailed()
    command.assertLogMatches(/DRIVE_DISK=s3/)
  })
})
