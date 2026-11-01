import { test } from '@japa/runner'
import Account from '#models/account'
import ImportBatch from '#models/import_batch'
import drive from '@adonisjs/drive/services/main'
import { nabFixture } from '#tests/helpers/importing'
import { createHousehold } from '#tests/helpers/household'
import ImportArchive from '#services/imports/import_archive'
import { nabHousehold, uploadCsv } from '#tests/helpers/imports'

/** The archived CSV key of every batch an upload staged. */
async function archivedKeys(batchIds: number[]) {
  const batches = await ImportBatch.query().whereIn('id', batchIds).orderBy('id')
  return batches.map((batch) => batch.filePath!)
}

test.group('Imports / archived CSV cleanup', (group) => {
  group.each.teardown(() => drive.restore())

  test('test_deleting_an_account_deletes_the_archived_csvs_of_its_imports', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const disk = drive.fake()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    upload.assertStatus(201)
    const batchIds = upload.body().data.map((batch: { id: number }) => batch.id)
    const keys = await archivedKeys(batchIds)
    assert.isNotEmpty(keys)
    for (const key of keys) disk.assertExists(key)
    const accountIds = new Set(
      upload.body().data.map((batch: { accountId: number }) => batch.accountId)
    )
    assert.equal(accountIds.size, 1)
    const [accountId] = accountIds

    const response = await client.delete(`/api/v1/accounts/${accountId}`).actingAs(home.owner)

    response.assertStatus(204)
    assert.isNull(await Account.find(accountId))
    assert.lengthOf(await ImportBatch.query().whereIn('id', batchIds), 0)
    for (const key of keys) disk.assertMissing(key)
  })

  test('test_deleting_an_account_keeps_the_archived_csvs_of_other_accounts', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const disk = drive.fake()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const [everydayKey] = await archivedKeys([upload.body().data[0].id])
    const savingsBatch = await ImportBatch.create({
      householdId: home.household.id,
      accountId: home.savings.id,
      source: 'nab_csv',
      status: 'completed',
      fileHash: 'e'.repeat(64),
    })
    const savingsKey = ImportArchive.keyFor(home.household.id, savingsBatch.id)
    await disk.put(savingsKey, 'Date,Amount\n')
    await savingsBatch.merge({ filePath: savingsKey }).save()

    const response = await client.delete(`/api/v1/accounts/${home.savings.id}`).actingAs(home.owner)

    response.assertStatus(204)
    disk.assertMissing(savingsKey)
    disk.assertExists(everydayKey)
    assert.isNotNull(await ImportBatch.find(upload.body().data[0].id))
  })

  test('test_a_storage_outage_never_blocks_deleting_the_account', async ({ client, assert }) => {
    const home = await nabHousehold()
    const disk = drive.fake()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const [batch] = upload.body().data
    const [key] = await archivedKeys([batch.id])
    disk.delete = async () => {
      throw new Error('bucket unreachable')
    }

    const response = await client.delete(`/api/v1/accounts/${batch.accountId}`).actingAs(home.owner)

    response.assertStatus(204)
    assert.isNull(await Account.find(batch.accountId))
    // Left for `node ace storage:sweep-imports`.
    disk.assertExists(key)
  })

  test('test_discarding_a_household_deletes_every_archived_csv_it_owns', async ({ assert }) => {
    const disk = drive.fake()
    const mine = await createHousehold()
    const theirs = await createHousehold()
    const ownKeys = [
      ImportArchive.keyFor(mine.household.id, 1),
      ImportArchive.keyFor(mine.household.id, 2),
    ]
    const theirKey = ImportArchive.keyFor(theirs.household.id, 3)
    for (const key of [...ownKeys, theirKey]) await disk.put(key, 'Date,Amount\n')

    await new ImportArchive().discardHousehold(mine.household.id)

    for (const key of ownKeys) disk.assertMissing(key)
    disk.assertExists(theirKey)
    assert.isTrue(await disk.exists(theirKey))
  })
})
