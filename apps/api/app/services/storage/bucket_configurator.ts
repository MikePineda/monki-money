import {
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  type CORSRule,
  type LifecycleRule,
  type S3Client,
} from '@aws-sdk/client-s3'
import {
  mergeCorsRules,
  mergeLifecycleRules,
  receiptsLifecycleRule,
  uploadCorsRule,
} from '#services/storage/bucket_rules'

/** The bucket settings after our rules are merged in. */
export interface BucketPlan {
  cors: CORSRule[]
  lifecycle: LifecycleRule[]
}

export interface BucketApplyResult {
  /** False where the storage has no bucket CORS (MinIO allows every origin). */
  corsApplied: boolean
}

/**
 * Reads the bucket's CORS and lifecycle configuration, merges in the rules
 * direct uploads need (bucket_rules.ts) and writes both back. Both S3 calls
 * replace the whole configuration, which is why the current one is read
 * and merged first. Cloudflare R2 supports both through its S3 API.
 */
export class BucketConfigurator {
  constructor(
    protected client: Pick<S3Client, 'send'>,
    protected bucket: string
  ) {}

  async plan(appUrl: string): Promise<BucketPlan> {
    const [cors, lifecycle] = await Promise.all([this.currentCors(), this.currentLifecycle()])
    return {
      cors: mergeCorsRules(cors, uploadCorsRule(appUrl)),
      lifecycle: mergeLifecycleRules(lifecycle, receiptsLifecycleRule()),
    }
  }

  async apply(plan: BucketPlan): Promise<BucketApplyResult> {
    let corsApplied = true
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: { CORSRules: plan.cors },
        })
      )
    } catch (error) {
      if (!isNotImplemented(error)) throw error
      corsApplied = false
    }

    await this.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.bucket,
        LifecycleConfiguration: { Rules: plan.lifecycle },
      })
    )
    return { corsApplied }
  }

  protected async currentCors(): Promise<CORSRule[]> {
    try {
      const current = await this.client.send(new GetBucketCorsCommand({ Bucket: this.bucket }))
      return current.CORSRules ?? []
    } catch (error) {
      if (errorName(error) === 'NoSuchCORSConfiguration') return []
      if (isNotImplemented(error)) return []
      throw error
    }
  }

  protected async currentLifecycle(): Promise<LifecycleRule[]> {
    try {
      const current = await this.client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: this.bucket })
      )
      return current.Rules ?? []
    } catch (error) {
      if (errorName(error) === 'NoSuchLifecycleConfiguration') return []
      throw error
    }
  }
}

function errorName(error: unknown) {
  return (error as { name?: string } | null)?.name
}

function isNotImplemented(error: unknown) {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
  return errorName(error) === 'NotImplemented' || status?.httpStatusCode === 501
}
