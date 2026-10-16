/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: {
    ready: typeof routes['health.ready']
    live: typeof routes['health.live']
  }
  config: {
    show: typeof routes['config.show']
  }
  auth: {
    signup: typeof routes['auth.signup']
    login: typeof routes['auth.login']
    email: {
      verify: typeof routes['auth.email.verify']
      resend: typeof routes['auth.email.resend']
      verifyCode: typeof routes['auth.email.verifyCode']
    }
    password: {
      forgot: typeof routes['auth.password.forgot']
      reset: typeof routes['auth.password.reset']
    }
    invitations: {
      show: typeof routes['auth.invitations.show']
      accept: typeof routes['auth.invitations.accept']
    }
    me: typeof routes['auth.me']
    logout: typeof routes['auth.logout']
    logoutAll: typeof routes['auth.logout_all']
  }
  me: {
    update: typeof routes['me.update']
  }
  households: {
    store: typeof routes['households.store']
  }
  household: {
    restore: typeof routes['household.restore']
    show: typeof routes['household.show']
    update: typeof routes['household.update']
    members: typeof routes['household.members']
    export: typeof routes['household.export']
    delete: typeof routes['household.delete']
    leave: typeof routes['household.leave']
    invitations: {
      index: typeof routes['household.invitations.index']
      store: typeof routes['household.invitations.store']
      destroy: typeof routes['household.invitations.destroy']
      resend: typeof routes['household.invitations.resend']
    }
  }
  accounts: {
    index: typeof routes['accounts.index']
    store: typeof routes['accounts.store']
    reorder: typeof routes['accounts.reorder']
    show: typeof routes['accounts.show']
    update: typeof routes['accounts.update']
    destroy: typeof routes['accounts.destroy']
    cards: {
      store: typeof routes['accounts.cards.store']
      destroy: typeof routes['accounts.cards.destroy']
    }
  }
  categoryGroups: {
    index: typeof routes['category_groups.index']
    store: typeof routes['category_groups.store']
    reorder: typeof routes['category_groups.reorder']
    update: typeof routes['category_groups.update']
    destroy: typeof routes['category_groups.destroy']
  }
  categories: {
    index: typeof routes['categories.index']
    store: typeof routes['categories.store']
    reorder: typeof routes['categories.reorder']
    update: typeof routes['categories.update']
    destroy: typeof routes['categories.destroy']
  }
  transactions: {
    index: typeof routes['transactions.index']
    store: typeof routes['transactions.store']
    quick: typeof routes['transactions.quick']
    bulkCategorize: typeof routes['transactions.bulkCategorize']
    show: typeof routes['transactions.show']
    update: typeof routes['transactions.update']
    destroy: typeof routes['transactions.destroy']
    splits: {
      update: typeof routes['transactions.splits.update']
    }
  }
  transfers: {
    store: typeof routes['transfers.store']
    update: typeof routes['transfers.update']
    destroy: typeof routes['transfers.destroy']
  }
  payslips: {
    index: typeof routes['payslips.index']
    store: typeof routes['payslips.store']
    candidates: typeof routes['payslips.candidates']
    destroy: typeof routes['payslips.destroy']
  }
  reports: {
    month: typeof routes['reports.month']
    trend: typeof routes['reports.trend']
    category: typeof routes['reports.category']
    balances: typeof routes['reports.balances']
  }
  goals: {
    index: typeof routes['goals.index']
    store: typeof routes['goals.store']
    reorder: typeof routes['goals.reorder']
    show: typeof routes['goals.show']
    update: typeof routes['goals.update']
    destroy: typeof routes['goals.destroy']
    projection: typeof routes['goals.projection']
  }
  insights: {
    show: typeof routes['insights.show']
    generate: typeof routes['insights.generate']
  }
  imports: {
    index: typeof routes['imports.index']
    store: typeof routes['imports.store']
    show: typeof routes['imports.show']
    classify: typeof routes['imports.classify']
    confirm: typeof routes['imports.confirm']
    cancel: typeof routes['imports.cancel']
    rows: {
      update: typeof routes['imports.rows.update']
    }
  }
  rules: {
    index: typeof routes['rules.index']
    store: typeof routes['rules.store']
    update: typeof routes['rules.update']
    destroy: typeof routes['rules.destroy']
    apply: typeof routes['rules.apply']
  }
  recurring: {
    index: typeof routes['recurring.index']
    merchants: typeof routes['recurring.merchants']
    store: typeof routes['recurring.store']
    detect: typeof routes['recurring.detect']
    update: typeof routes['recurring.update']
    destroy: typeof routes['recurring.destroy']
  }
  uploads: {
    presign: typeof routes['uploads.presign']
  }
  receipts: {
    scan: typeof routes['receipts.scan']
  }
}
