import { RECEIPTS_PREFIX } from '#domain/receipts/receipt_key'
import type { CORSRule, LifecycleRule } from '@aws-sdk/client-s3'

/**
 * The bucket settings direct uploads need (`node ace storage:configure`),
 * as pure builders and merges. Merging instead of replacing keeps whatever
 * else lives on the bucket (R2's default multipart-abort rule, a CORS rule
 * someone added for another origin) and makes re-runs no-ops.
 */

/** Id of the lifecycle rule that expires receipt photos. */
export const RECEIPTS_LIFECYCLE_RULE_ID = 'expire-receipts'

/** How long browsers may cache the CORS preflight. */
export const UPLOAD_CORS_MAX_AGE_SECONDS = 3600

/**
 * Lets pages served from `appUrl` PUT to presigned URLs: the preflight
 * allows `Content-Type` (the only header the client sets; `Content-Length`
 * is the browser's own). Only the origin of `appUrl` counts.
 */
export function uploadCorsRule(appUrl: string): CORSRule {
  return {
    AllowedOrigins: [new URL(appUrl).origin],
    AllowedMethods: ['PUT'],
    AllowedHeaders: ['Content-Type'],
    MaxAgeSeconds: UPLOAD_CORS_MAX_AGE_SECONDS,
  }
}

/**
 * Receipt photos are deleted right after the scan; anything left behind (a
 * photo never scanned, a failed delete) expires after one day.
 */
export function receiptsLifecycleRule(): LifecycleRule {
  return {
    ID: RECEIPTS_LIFECYCLE_RULE_ID,
    Status: 'Enabled',
    Filter: { Prefix: RECEIPTS_PREFIX },
    Expiration: { Days: 1 },
  }
}

/** `rule` replaces any rule for exactly the same origins; the rest stay, in order. */
export function mergeCorsRules(existing: CORSRule[], rule: CORSRule): CORSRule[] {
  const origins = originKey(rule)
  return [...existing.filter((current) => originKey(current) !== origins), rule]
}

/** `rule` replaces any rule with its id or its prefix; the rest stay, in order. */
export function mergeLifecycleRules(
  existing: LifecycleRule[],
  rule: LifecycleRule
): LifecycleRule[] {
  const prefix = prefixOf(rule)
  return [
    ...existing.filter((current) => current.ID !== rule.ID && prefixOf(current) !== prefix),
    rule,
  ]
}

function originKey(rule: CORSRule) {
  return [...(rule.AllowedOrigins ?? [])].sort().join(' ')
}

/** The rule's prefix, from `Filter.Prefix` or the legacy top-level `Prefix`. */
function prefixOf(rule: LifecycleRule): string | undefined {
  return rule.Filter?.Prefix ?? rule.Prefix
}
