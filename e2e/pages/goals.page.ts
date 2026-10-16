import { expect, type Locator, type Page } from '@playwright/test'

type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00'

/** `/goals`: the goal cards, the status filter chips and "New goal". */
export class GoalsPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('goals.list')
  }
  get empty() {
    return this.page.getByTestId('goals.empty')
  }
  get addButton() {
    return this.page.getByTestId('goals.add')
  }

  async goto(): Promise<void> {
    await this.page.goto('/goals')
    await this.waitReady()
  }

  /** The cards (or the empty state) are on screen. */
  async waitReady(): Promise<void> {
    await expect(this.page.getByTestId('goals.loading')).toHaveCount(0)
    await expect(this.list.or(this.empty)).toBeVisible()
  }

  filter(status: 'active' | 'reached' | 'archived'): Locator {
    return this.page.getByTestId(`goals.filter.${status}`)
  }

  async show(status: 'active' | 'reached' | 'archived'): Promise<void> {
    await this.filter(status).click()
    await expect(this.filter(status)).toHaveAttribute('aria-pressed', 'true')
    await this.waitReady()
  }

  card(name: string): Locator {
    return this.page
      .getByTestId('goals.card')
      .filter({ has: this.page.getByTestId('goals.card.name').getByText(name, { exact: true }) })
  }

  badge(name: string): Locator {
    return this.card(name).getByTestId('goals.card.badge')
  }

  async open(name: string): Promise<void> {
    await this.card(name).getByTestId('goals.card.link').click()
    await expect(this.page).toHaveURL(/\/goals\/\d+$/)
  }
}

/** `/goals/new` and the edit form on a goal: keypad amounts, segments, submit. */
export class GoalFormPage {
  constructor(private readonly page: Page) {}

  get name() {
    return this.page.getByTestId('goals.form.name').getByRole('textbox')
  }
  get submit() {
    return this.page.getByTestId('goals.form.submit')
  }

  /** Opens a money field's keypad and types the amount from the cents up. */
  async amount(field: 'target' | 'starting' | 'monthly', ...keys: KeypadKey[]): Promise<void> {
    const button = this.page.getByTestId(`goals.form.${field}`)
    if ((await button.getAttribute('aria-expanded')) !== 'true') {
      await button.click()
    }
    const keypad = this.page.getByTestId(`goals.form.${field}Keypad`)
    for (const key of keys) {
      await keypad.locator(`button[data-key="${key}"]`).click()
    }
  }

  /** Picks an option of a segmented control by its group label. */
  async choose(group: string, option: string): Promise<void> {
    await this.page
      .getByRole('radiogroup', { name: group })
      .getByRole('radio', { name: option })
      .click()
  }
}

/** `/goals/:id`: hero, projection, stat tiles and actions. */
export class GoalDetailPage {
  constructor(private readonly page: Page) {}

  get name() {
    return this.page.getByTestId('goal.name')
  }
  get saved() {
    return this.page.getByTestId('goal.saved')
  }
  get chart() {
    return this.page.getByTestId('goal.chart')
  }
  get badge() {
    return this.page.getByTestId('goal.badge')
  }
  get markReached() {
    return this.page.getByTestId('goal.markReached')
  }
  get reopen() {
    return this.page.getByTestId('goal.reopen')
  }
  /** The prompt an active goal with nothing left to save leads with. */
  get atTarget() {
    return this.page.getByTestId('goal.atTarget')
  }
  get reachedOn() {
    return this.page.getByTestId('goal.reachedOn')
  }
  /** The solid line's month-end markers (the history). */
  get actualPoints() {
    return this.chart.locator('g[data-series="actual"] circle')
  }
  get back() {
    return this.page.getByRole('link', { name: 'Back' })
  }

  stat(name: 'months' | 'date' | 'rate'): Locator {
    return this.page.getByTestId(`goal.stats.${name}`).getByTestId('goals.stat.value')
  }

  async waitReady(): Promise<void> {
    await expect(this.page.getByTestId('goal.loading')).toHaveCount(0)
    await expect(this.page.getByTestId('goal.hero')).toBeVisible()
  }
}
