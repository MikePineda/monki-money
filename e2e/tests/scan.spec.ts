import type { BrowserContext } from '@playwright/test'
import { ScanPage } from '../pages/scan.page.ts'
import { expect, signUpOwner, test } from '../support/fixtures.ts'
import { receiptPng } from '../support/png.ts'

/**
 * The E2E API runs the fake model, whose receipt answer is
 * apps/api/tests/fixtures/llm/receipt.json: Corner Grocer, 14 Sep 2026,
 * $23.45 in Groceries over three lines ($3.90, $16.55, $3.00).
 */
const MONTH = '2026-09'

interface LedgerRow {
  payee: string | null
  amountCents: number
  isSplit: boolean
  splits: { amountCents: number; memo: string | null }[]
}

/** The month's ledger rows (`GET /transactions`). */
async function rowsIn(context: BrowserContext, month: string): Promise<LedgerRow[]> {
  const response = await context.request.get(`/api/v1/transactions?month=${month}`)
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { data: LedgerRow[] }).data
}

test.describe('journey 6: scan a receipt', () => {
  // The photo goes straight to the bucket: the stack needs S3 (MinIO in docker-compose.test.yml).
  test.skip(
    process.env.DRIVE_DISK !== 's3' || !process.env.S3_ENDPOINT,
    'The E2E API has no S3 bucket (DRIVE_DISK=s3 and S3_* in e2e/e2e.env), so receipts cannot be uploaded'
  )

  test('photo, review, split by lines and save as one split expense', async ({ page, context }) => {
    await signUpOwner(context)
    expect(await rowsIn(context, MONTH)).toHaveLength(0)

    // Capture: a generated photo goes up through the presigned URL and is read.
    const scan = new ScanPage(page)
    await scan.goto()
    await scan.upload({ name: 'receipt.png', mimeType: 'image/png', buffer: receiptPng() })

    // Review: the fixture's merchant, total and category fill the form.
    await expect(scan.payee).toHaveValue('Corner Grocer')
    await expect(scan.amount).toHaveText('$23.45')
    await expect(scan.category).toHaveText('Groceries')
    await expect(scan.confidence).toHaveAttribute('data-level', 'high')

    // The reduced photo stays in memory while reviewing, to compare with the fields.
    await scan.showPhoto()
    await expect(scan.photo).toHaveAttribute('src', /^blob:/)
    await expect
      .poll(() => scan.photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)

    // Split by lines: one line per printed item, all in the receipt's category.
    await scan.splitByLines()
    await expect(scan.lines).toHaveCount(3)
    await expect(scan.lines.first()).toContainText('Bananas 1kg')
    await expect(scan.saveButton).toHaveText('Save −$23.45')
    await scan.save()

    // The ledger holds one split expense whose lines add up to the total.
    const rows = await rowsIn(context, MONTH)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row).toMatchObject({ payee: 'Corner Grocer', amountCents: -2345, isSplit: true })
    expect(row?.splits.map((split) => Math.abs(split.amountCents))).toEqual([390, 1655, 300])
    expect(row?.splits.map((split) => split.memo)).toEqual([
      'Bananas 1kg',
      'Coffee beans 500g',
      'Sourdough loaf',
    ])
  })
})
