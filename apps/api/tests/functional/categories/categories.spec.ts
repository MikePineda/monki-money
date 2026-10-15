import { test } from '@japa/runner'
import Category from '#models/category'
import app from '@adonisjs/core/services/app'
import CategoryGroup from '#models/category_group'
import CategoryUsage from '#services/categories/category_usage'
import { createHousehold } from '#tests/helpers/household'

async function categoryBySlug(householdId: number, slug: string) {
  return Category.query().where('household_id', householdId).where('slug', slug).firstOrFail()
}

async function groupBySlug(householdId: number, slug: string) {
  return CategoryGroup.query().where('household_id', householdId).where('slug', slug).firstOrFail()
}

test.group('Categories', () => {
  test('test_tree_lists_groups_with_their_categories_in_order', async ({ client, assert }) => {
    const { owner } = await createHousehold({ taxonomy: true })

    const response = await client.get('/api/v1/categories').qs({ tree: 1 }).actingAs(owner)

    response.assertStatus(200)
    const groups = response.body().data
    assert.equal(groups[0].slug, 'housing')
    assert.deepEqual(
      groups[0].categories.map((c: any) => c.slug),
      ['rent', 'utilities', 'phone-internet', 'home-goods']
    )
    assert.equal(groups.at(-1).kind, 'income')
  })

  test('test_flat_list_without_tree', async ({ client, assert }) => {
    const { owner } = await createHousehold({ taxonomy: true })

    const response = await client.get('/api/v1/categories').actingAs(owner)

    response.assertStatus(200)
    assert.isTrue(response.body().data.every((c: any) => typeof c.categoryGroupId === 'number'))
    assert.notProperty(response.body().data[0], 'categories')
  })

  test('test_system_names_follow_the_reader_locale', async ({ client, assert }) => {
    // Seeded in English; a Spanish-speaking member reads Spanish names.
    const { owner, member } = await createHousehold({ users: 2, taxonomy: true })
    member.locale = 'es'
    await member.save()

    const english = await client.get('/api/v1/categories').qs({ tree: 1 }).actingAs(owner)
    const spanish = await client.get('/api/v1/categories').qs({ tree: 1 }).actingAs(member)

    const find = (groups: any[], slug: string) =>
      groups.flatMap((g) => g.categories).find((c: any) => c.slug === slug)
    assert.equal(find(english.body().data, 'groceries').name, 'Groceries')
    assert.equal(find(spanish.body().data, 'groceries').name, 'Supermercado')
    assert.equal(spanish.body().data[0].name, 'Vivienda')
  })

  test('test_renamed_system_category_keeps_the_typed_name', async ({ client, assert }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const groceries = await categoryBySlug(household.id, 'groceries')

    const response = await client
      .patch(`/api/v1/categories/${groceries.id}`)
      .json({ name: 'Super' })
      .actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({ data: { name: 'Super', slug: 'groceries', isSystem: false } })
    await groceries.refresh()
    assert.equal(groceries.slug, 'groceries')
  })

  test('test_create_a_category_with_a_unique_slug', async ({ client }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const food = await groupBySlug(household.id, 'food')

    const first = await client
      .post('/api/v1/categories')
      .json({ categoryGroupId: food.id, name: 'Groceries' })
      .actingAs(owner)
    first.assertStatus(201)
    first.assertBodyContains({ data: { name: 'Groceries', slug: 'groceries-2', isSystem: false } })
  })

  test('test_foreign_category_group_id_is_rejected_with_422', async ({ client }) => {
    const { owner } = await createHousehold()
    const other = await createHousehold({ taxonomy: true })
    const foreignGroup = await groupBySlug(other.household.id, 'food')

    const response = await client
      .post('/api/v1/categories')
      .json({ categoryGroupId: foreignGroup.id, name: 'Sneaky' })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'categoryGroupId', rule: 'database.exists' }] })
  })

  test('test_reorder_updates_sort_order', async ({ client, assert }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const rent = await categoryBySlug(household.id, 'rent')
    const utilities = await categoryBySlug(household.id, 'utilities')
    const phone = await categoryBySlug(household.id, 'phone-internet')
    const home = await categoryBySlug(household.id, 'home-goods')

    const response = await client
      .put('/api/v1/categories/reorder')
      .json({ ids: [home.id, phone.id, utilities.id, rent.id] })
      .actingAs(owner)
    response.assertStatus(204)

    const tree = await client.get('/api/v1/categories').qs({ tree: 1 }).actingAs(owner)
    assert.deepEqual(
      tree.body().data[0].categories.map((c: any) => c.slug),
      ['home-goods', 'phone-internet', 'utilities', 'rent']
    )
  })

  test('test_reorder_rejects_ids_of_another_household', async ({ client }) => {
    const { owner } = await createHousehold({ taxonomy: true })
    const other = await createHousehold({ taxonomy: true })
    const foreign = await categoryBySlug(other.household.id, 'rent')

    const response = await client
      .put('/api/v1/categories/reorder')
      .json({ ids: [foreign.id] })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'ids', rule: 'database.exists' }] })
  })

  test('test_delete_unused_category', async ({ client, assert }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const snacks = await categoryBySlug(household.id, 'snacks')

    const response = await client.delete(`/api/v1/categories/${snacks.id}`).actingAs(owner)

    response.assertStatus(204)
    assert.isNull(await Category.find(snacks.id))
  })

  test('test_category_with_transactions_cannot_be_deleted', async ({ client, assert, cleanup }) => {
    class UsedCategory extends CategoryUsage {
      override async referenceCount() {
        return 4
      }
    }
    app.container.swap(CategoryUsage, () => new UsedCategory())
    cleanup(() => app.container.restore(CategoryUsage))
    const { owner, household } = await createHousehold({ taxonomy: true })
    const snacks = await categoryBySlug(household.id, 'snacks')

    const response = await client.delete(`/api/v1/categories/${snacks.id}`).actingAs(owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_CATEGORY_IN_USE' })
    assert.isNotNull(await Category.find(snacks.id))
  })

  test('test_delete_reassigns_references_to_the_replacement', async ({
    client,
    assert,
    cleanup,
  }) => {
    const reassigned: Array<[number, number]> = []
    class UsedCategory extends CategoryUsage {
      override async referenceCount() {
        return 4
      }
      override async reassign(from: Category, to: Category) {
        reassigned.push([from.id, to.id])
      }
    }
    app.container.swap(CategoryUsage, () => new UsedCategory())
    cleanup(() => app.container.restore(CategoryUsage))
    const { owner, household } = await createHousehold({ taxonomy: true })
    const snacks = await categoryBySlug(household.id, 'snacks')
    const groceries = await categoryBySlug(household.id, 'groceries')

    const response = await client
      .delete(`/api/v1/categories/${snacks.id}`)
      .json({ reassignToCategoryId: groceries.id })
      .actingAs(owner)

    response.assertStatus(204)
    assert.deepEqual(reassigned, [[snacks.id, groceries.id]])
    assert.isNull(await Category.find(snacks.id))
  })

  test('test_delete_rejects_a_replacement_from_another_household', async ({ client }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const other = await createHousehold({ taxonomy: true })
    const snacks = await categoryBySlug(household.id, 'snacks')
    const foreign = await categoryBySlug(other.household.id, 'groceries')

    const response = await client
      .delete(`/api/v1/categories/${snacks.id}`)
      .json({ reassignToCategoryId: foreign.id })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'reassignToCategoryId', rule: 'database.exists' }],
    })
  })
})

test.group('Category groups', () => {
  test('test_create_rename_and_hide_a_group', async ({ client, assert }) => {
    const { owner } = await createHousehold()

    const created = await client
      .post('/api/v1/category-groups')
      .json({ name: 'Pets', kind: 'expense' })
      .actingAs(owner)
    created.assertStatus(201)
    created.assertBodyContains({ data: { name: 'Pets', slug: 'pets', kind: 'expense' } })

    const updated = await client
      .patch(`/api/v1/category-groups/${created.body().data.id}`)
      .json({ name: 'Pet care', isHidden: true })
      .actingAs(owner)
    updated.assertStatus(200)
    assert.equal(updated.body().data.name, 'Pet care')
    assert.isTrue(updated.body().data.isHidden)
  })

  test('test_group_list_follows_sort_order', async ({ client, assert }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const income = await groupBySlug(household.id, 'income')
    const housing = await groupBySlug(household.id, 'housing')

    const reorder = await client
      .put('/api/v1/category-groups/reorder')
      .json({ ids: [income.id, housing.id] })
      .actingAs(owner)
    reorder.assertStatus(204)

    const list = await client.get('/api/v1/category-groups').actingAs(owner)
    list.assertStatus(200)
    assert.deepEqual(
      list
        .body()
        .data.slice(0, 2)
        .map((g: any) => g.slug),
      ['income', 'housing']
    )
  })

  test('test_non_empty_group_cannot_be_deleted', async ({ client, assert }) => {
    const { owner, household } = await createHousehold({ taxonomy: true })
    const food = await groupBySlug(household.id, 'food')

    const response = await client.delete(`/api/v1/category-groups/${food.id}`).actingAs(owner)

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_GROUP_NOT_EMPTY' })
    assert.isNotNull(await CategoryGroup.find(food.id))
  })

  test('test_empty_group_is_deleted', async ({ client, assert }) => {
    const { owner } = await createHousehold()
    const created = await client
      .post('/api/v1/category-groups')
      .json({ name: 'Temporary' })
      .actingAs(owner)

    const response = await client
      .delete(`/api/v1/category-groups/${created.body().data.id}`)
      .actingAs(owner)

    response.assertStatus(204)
    assert.isNull(await CategoryGroup.find(created.body().data.id))
  })
})
