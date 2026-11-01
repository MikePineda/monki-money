import { test } from '@japa/runner'
import env from '#start/env'
import ace from '@adonisjs/core/services/ace'
import ImportBatch from '#models/import_batch'
import drive from '@adonisjs/drive/services/main'
import { createHousehold } from '#tests/helpers/household'
import ImportArchive from '#services/imports/import_archive'
import StorageSweepImports from '#commands/storage_sweep_imports'

async function run(...args: string[]) {
  const command = await ace.create(StorageSweepImports, args)
  await command.exec()
  return command
}

/**
 * A household with one batch whose CSV is archived, one archived CSV whose
 * batch is gone (a deleted account), one of a deleted household, and a
 * stray object under the prefix that is not an archived CSV.
 */
async function bucketWithOrphans() {
  const disk = drive.fake()
  const home = await createHousehold({ accounts: [{ name: 'Everyday' }] })
  const batch = await ImportBatch.create({
    householdId: home.household.id,
    accountId: home.accounts[0].id,
    source: 'nab_csv',
    status: 'completed',
    fileHash: 'f'.repeat(64),
  })
  const live = ImportArchive.keyFor(home.household.id, batch.id)
  const goneBatch = ImportArchive.keyFor(home.household.id, batch.id + 1_000)
  // The batch id exists, but in another household: not this key's batch.
  const goneHousehold = ImportArchive.keyFor(home.household.id + 1_000, batch.id)
  const stray = 'imports/readme.txt'
  for (const key of [live, goneBatch, goneHousehold, stray]) await disk.put(key, 'Date,Amount\n')
  await batch.merge({ filePath: live }).save()
  // Outside the prefix: never listed.
  await disk.put('receipts/1/photo.jpg', 'jpeg')
  return { disk, live, goneBatch, goneHousehold, stray }
}

test.group('Storage: storage:sweep-imports command', (group) => {
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    return () => {
      ace.ui.switchMode('normal')
      drive.restore()
    }
  })

  test('test_sweep_is_a_dry_run_by_default_and_deletes_nothing', async () => {
    const { disk, live, goneBatch, goneHousehold, stray } = await bucketWithOrphans()

    const command = await run()

    command.assertSucceeded()
    command.assertLogMatches(/scanned 4, kept 1, orphaned 2, deleted 0, unrecognised 1/)
    command.assertLogMatches(new RegExp(`orphan ${goneBatch}`))
    command.assertLogMatches(new RegExp(`orphan ${goneHousehold}`))
    command.assertLogMatches(/dry run/)
    for (const key of [live, goneBatch, goneHousehold, stray]) disk.assertExists(key)
  })

  test('test_sweep_with_force_deletes_only_csvs_whose_batch_is_gone', async () => {
    const { disk, live, goneBatch, goneHousehold, stray } = await bucketWithOrphans()

    const command = await run('--force')

    command.assertSucceeded()
    command.assertLogMatches(/scanned 4, kept 1, orphaned 2, deleted 2, unrecognised 1/)
    disk.assertMissing(goneBatch)
    disk.assertMissing(goneHousehold)
    disk.assertExists(live)
    disk.assertExists(stray)
    disk.assertExists('receipts/1/photo.jpg')
  })

  test('test_sweep_of_an_empty_prefix_finds_nothing', async () => {
    drive.fake()

    const command = await run('--force')

    command.assertSucceeded()
    command.assertLogMatches(/scanned 0, kept 0, orphaned 0, deleted 0, unrecognised 0/)
  })

  test('test_sweep_fails_when_an_orphan_cannot_be_deleted', async () => {
    const { disk, goneBatch } = await bucketWithOrphans()
    disk.delete = async () => {
      throw new Error('bucket unreachable')
    }

    const command = await run('--force')

    command.assertFailed()
    command.assertLogMatches(/2 orphan\(s\) could not be deleted/)
    disk.assertExists(goneBatch)
  })

  test('test_sweep_refuses_force_together_with_dry_run', async () => {
    const { disk, goneBatch } = await bucketWithOrphans()

    const command = await run('--force', '--dry-run')

    command.assertFailed()
    disk.assertExists(goneBatch)
  })

  test('test_sweep_needs_a_storage_disk', async ({ cleanup }) => {
    const disk = env.get('DRIVE_DISK')
    env.set('DRIVE_DISK', '' as never)
    cleanup(() => env.set('DRIVE_DISK', disk as never))

    const command = await run()

    command.assertFailed()
    command.assertLogMatches(/DRIVE_DISK/)
  })
})
