import { test } from '@japa/runner'
import {
  mergeCorsRules,
  mergeLifecycleRules,
  receiptsLifecycleRule,
  uploadCorsRule,
} from '#services/storage/bucket_rules'

/** The rule R2 puts on every new bucket; it must survive our changes. */
const R2_DEFAULT_RULE = {
  ID: 'Default Multipart Abort Rule',
  Status: 'Enabled' as const,
  Filter: { Prefix: '' },
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
}

test.group('Bucket rules', () => {
  test('test_storage_configure_builds_cors_and_lifecycle_for_app_origin', ({ assert }) => {
    assert.deepEqual(uploadCorsRule('https://money.example.test/some/path?x=1'), {
      AllowedOrigins: ['https://money.example.test'],
      AllowedMethods: ['PUT'],
      AllowedHeaders: ['Content-Type'],
      MaxAgeSeconds: 3600,
    })
    assert.deepEqual(uploadCorsRule('http://localhost:3333').AllowedOrigins, [
      'http://localhost:3333',
    ])
    assert.deepEqual(receiptsLifecycleRule(), {
      ID: 'expire-receipts',
      Status: 'Enabled',
      Filter: { Prefix: 'receipts/' },
      Expiration: { Days: 1 },
    })
  })

  test('test_storage_configure_keeps_other_rules_and_replaces_its_own', ({ assert }) => {
    const ours = uploadCorsRule('https://money.example.test')
    const devRule = { AllowedOrigins: ['http://localhost:4200'], AllowedMethods: ['PUT'] }
    const staleOurs = { ...ours, AllowedHeaders: ['*'], MaxAgeSeconds: 60 }

    assert.deepEqual(mergeCorsRules([devRule, staleOurs], ours), [devRule, ours])
    assert.deepEqual(mergeCorsRules([], ours), [ours])

    const expiry = receiptsLifecycleRule()
    const renamed = { ...expiry, ID: 'made-in-the-dashboard' }
    const legacyPrefix = { ID: 'old', Status: 'Enabled' as const, Prefix: 'receipts/' }
    assert.deepEqual(mergeLifecycleRules([R2_DEFAULT_RULE, renamed], expiry), [
      R2_DEFAULT_RULE,
      expiry,
    ])
    assert.deepEqual(mergeLifecycleRules([legacyPrefix], expiry), [expiry])
    const otherPrefix = { ...expiry, ID: 'expire-exports', Filter: { Prefix: 'exports/' } }
    assert.deepEqual(mergeLifecycleRules([otherPrefix], expiry), [otherPrefix, expiry])
  })

  test('test_storage_configure_rules_are_idempotent', ({ assert }) => {
    const cors = uploadCorsRule('https://money.example.test')
    const expiry = receiptsLifecycleRule()

    const once = mergeLifecycleRules([R2_DEFAULT_RULE], expiry)
    assert.deepEqual(mergeLifecycleRules(once, expiry), once)
    const corsOnce = mergeCorsRules([], cors)
    assert.deepEqual(mergeCorsRules(corsOnce, cors), corsOnce)
  })
})
