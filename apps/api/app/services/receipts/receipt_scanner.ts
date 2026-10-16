import { inject } from '@adonisjs/core'
import type User from '#models/user'
import { LlmProviderError } from '#llm/errors'
import { LlmProvider } from '#llm/llm_provider'
import app from '@adonisjs/core/services/app'
import type Household from '#models/household'
import { FieldError } from '#exceptions/field_error'
import { UploadNotFound } from '#exceptions/errors'
import { MAX_RECEIPT_BYTES } from '@monkimoney/shared'
import logger from '@adonisjs/core/services/logger'
import type { ReceiptExtraction, ReceiptMediaType } from '#llm/types'
import type { ScanReceiptInput, ScannedReceipt } from '#services/receipts/dto'
import EntitlementsService from '#services/entitlements/entitlements_service'
import { llmCategoryChoices } from '#services/categories/llm_category_choices'
import {
  RECEIPT_UPLOAD_TYPES,
  isReceiptUploadType,
  receiptKeyHousehold,
} from '#domain/receipts/receipt_key'
import {
  ObjectStorage,
  StoredObjectMissing,
  StoredObjectTooLarge,
  type StoredObjectInfo,
} from '#services/storage/object_storage'

const MAX_SIZE_LABEL = '10 MB'

/**
 * Reads a receipt photo the browser uploaded with a presigned PUT and turns
 * it into a transaction draft. Nothing about the receipt is kept: the photo
 * is read into memory, reduced (<= 1600 px, metadata stripped, JPEG, inside
 * `LlmProvider.extractReceipt`), sent to the vision model and deleted from
 * the bucket afterwards, whatever happened (best effort; the bucket's
 * one-day lifecycle rule is the safety net). The person then saves the
 * draft through `POST /transactions` with `source: 'receipt'`.
 *
 * Tenancy: the key must sit under the household's own prefix; anything else
 * answers 404 without touching the bucket.
 */
@inject()
export default class ReceiptScanner {
  constructor(
    protected storage: ObjectStorage,
    protected llm: LlmProvider,
    protected entitlements: EntitlementsService
  ) {}

  async scan(household: Household, user: User, input: ScanReceiptInput): Promise<ScannedReceipt> {
    if (receiptKeyHousehold(input.key) !== household.id) throw new UploadNotFound()
    const object = await this.storage.head(input.key)
    if (!object) throw new UploadNotFound()

    try {
      return await this.read(household, user, input.key, object)
    } finally {
      await this.discard(household, input.key)
    }
  }

  protected async read(
    household: Household,
    user: User,
    key: string,
    object: StoredObjectInfo
  ): Promise<ScannedReceipt> {
    const mediaType = object.contentType
    if (!isReceiptUploadType(mediaType)) {
      throw new FieldError('key', 'mimetype', { types: RECEIPT_UPLOAD_TYPES.join(', ') })
    }
    if (object.byteSize > MAX_RECEIPT_BYTES) {
      throw new FieldError('key', 'fileSize', { size: MAX_SIZE_LABEL })
    }
    if (!this.llm.isLive && !this.fakeLlmAllowed()) {
      throw new LlmProviderError('No LLM is configured: receipt scanning needs LLM_API_KEY')
    }
    // Before downloading the photo; the provider checks again before its call.
    await this.entitlements.assertLlmQuota(household)

    const bytes = await this.download(key)
    const categories = await llmCategoryChoices(household)
    const extraction = await this.extract(household, user, bytes, mediaType, categories)

    const category = categories.find((choice) => choice.slug === extraction.categorySlug)
    return { ...extraction, categoryId: category?.id ?? null, key }
  }

  protected async download(key: string): Promise<Buffer> {
    try {
      return await this.storage.getBytes(key, MAX_RECEIPT_BYTES)
    } catch (error) {
      if (error instanceof StoredObjectTooLarge) {
        throw new FieldError('key', 'fileSize', { size: MAX_SIZE_LABEL })
      }
      if (error instanceof StoredObjectMissing) throw new UploadNotFound()
      throw error
    }
  }

  protected async extract(
    household: Household,
    user: User,
    bytes: Buffer,
    mediaType: ReceiptMediaType,
    categories: Awaited<ReturnType<typeof llmCategoryChoices>>
  ): Promise<ReceiptExtraction> {
    try {
      const result = await this.llm.extractReceipt(
        {
          image: { base64: bytes.toString('base64'), mediaType },
          categories,
          currencyCode: household.currencyCode,
        },
        { householdId: household.id, userId: user.id }
      )
      return result.data
    } catch (error) {
      // The image pipeline names its field `image`; this endpoint's is `key`.
      if (error instanceof FieldError && error.field === 'image') {
        throw new FieldError('key', error.rule, error.meta)
      }
      throw error
    }
  }

  /**
   * The fake provider answers with fixtures: fine for the test suite, never
   * for a person. Anywhere else a scan without a live model answers 503.
   */
  protected fakeLlmAllowed() {
    return app.inTest
  }

  /** Best effort: a failed delete is logged and left to the lifecycle rule. */
  protected async discard(household: Household, key: string) {
    try {
      await this.storage.delete(key)
    } catch (error) {
      logger.warn(
        { err: error, householdId: household.id, key },
        'receipt scan: could not delete the photo'
      )
    }
  }
}
