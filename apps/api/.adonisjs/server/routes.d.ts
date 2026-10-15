import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'config.show': { paramsTuple?: []; params?: {} }
    'auth.signup': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.email.verify': { paramsTuple?: []; params?: {} }
    'auth.password.forgot': { paramsTuple?: []; params?: {} }
    'auth.password.reset': { paramsTuple?: []; params?: {} }
    'auth.invitations.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'auth.invitations.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'auth.logout_all': { paramsTuple?: []; params?: {} }
    'auth.email.resend': { paramsTuple?: []; params?: {} }
    'auth.email.verifyCode': { paramsTuple?: []; params?: {} }
    'me.update': { paramsTuple?: []; params?: {} }
    'households.store': { paramsTuple?: []; params?: {} }
    'household.restore': { paramsTuple?: []; params?: {} }
    'household.show': { paramsTuple?: []; params?: {} }
    'household.update': { paramsTuple?: []; params?: {} }
    'household.members': { paramsTuple?: []; params?: {} }
    'household.export': { paramsTuple?: []; params?: {} }
    'household.delete': { paramsTuple?: []; params?: {} }
    'household.leave': { paramsTuple?: []; params?: {} }
    'household.invitations.index': { paramsTuple?: []; params?: {} }
    'household.invitations.store': { paramsTuple?: []; params?: {} }
    'household.invitations.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'household.invitations.resend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.index': { paramsTuple?: []; params?: {} }
    'accounts.store': { paramsTuple?: []; params?: {} }
    'accounts.reorder': { paramsTuple?: []; params?: {} }
    'accounts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.cards.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.cards.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'cardId': ParamValue} }
    'category_groups.index': { paramsTuple?: []; params?: {} }
    'category_groups.store': { paramsTuple?: []; params?: {} }
    'category_groups.reorder': { paramsTuple?: []; params?: {} }
    'category_groups.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.index': { paramsTuple?: []; params?: {} }
    'categories.store': { paramsTuple?: []; params?: {} }
    'categories.reorder': { paramsTuple?: []; params?: {} }
    'categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.index': { paramsTuple?: []; params?: {} }
    'transactions.store': { paramsTuple?: []; params?: {} }
    'transactions.quick': { paramsTuple?: []; params?: {} }
    'transactions.bulkCategorize': { paramsTuple?: []; params?: {} }
    'transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.splits.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.store': { paramsTuple?: []; params?: {} }
    'transfers.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'reports.month': { paramsTuple?: []; params?: {} }
    'reports.trend': { paramsTuple?: []; params?: {} }
    'reports.category': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'reports.balances': { paramsTuple?: []; params?: {} }
    'goals.index': { paramsTuple?: []; params?: {} }
    'goals.store': { paramsTuple?: []; params?: {} }
    'goals.reorder': { paramsTuple?: []; params?: {} }
    'goals.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.projection': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'insights.show': { paramsTuple: [ParamValue]; params: {'month': ParamValue} }
    'insights.generate': { paramsTuple: [ParamValue]; params: {'month': ParamValue} }
    'imports.index': { paramsTuple?: []; params?: {} }
    'imports.store': { paramsTuple?: []; params?: {} }
    'imports.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.classify': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.confirm': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.rows.update': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'rowId': ParamValue} }
    'rules.index': { paramsTuple?: []; params?: {} }
    'rules.store': { paramsTuple?: []; params?: {} }
    'rules.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'rules.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'rules.apply': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'uploads.presign': { paramsTuple?: []; params?: {} }
    'receipts.scan': { paramsTuple?: []; params?: {} }
    'spa.fallback': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
  }
  GET: {
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'config.show': { paramsTuple?: []; params?: {} }
    'auth.invitations.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'household.show': { paramsTuple?: []; params?: {} }
    'household.members': { paramsTuple?: []; params?: {} }
    'household.export': { paramsTuple?: []; params?: {} }
    'household.invitations.index': { paramsTuple?: []; params?: {} }
    'accounts.index': { paramsTuple?: []; params?: {} }
    'accounts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.index': { paramsTuple?: []; params?: {} }
    'categories.index': { paramsTuple?: []; params?: {} }
    'transactions.index': { paramsTuple?: []; params?: {} }
    'transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'reports.month': { paramsTuple?: []; params?: {} }
    'reports.trend': { paramsTuple?: []; params?: {} }
    'reports.category': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'reports.balances': { paramsTuple?: []; params?: {} }
    'goals.index': { paramsTuple?: []; params?: {} }
    'goals.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.projection': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'insights.show': { paramsTuple: [ParamValue]; params: {'month': ParamValue} }
    'imports.index': { paramsTuple?: []; params?: {} }
    'imports.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'rules.index': { paramsTuple?: []; params?: {} }
    'spa.fallback': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
  }
  HEAD: {
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'config.show': { paramsTuple?: []; params?: {} }
    'auth.invitations.show': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'household.show': { paramsTuple?: []; params?: {} }
    'household.members': { paramsTuple?: []; params?: {} }
    'household.export': { paramsTuple?: []; params?: {} }
    'household.invitations.index': { paramsTuple?: []; params?: {} }
    'accounts.index': { paramsTuple?: []; params?: {} }
    'accounts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.index': { paramsTuple?: []; params?: {} }
    'categories.index': { paramsTuple?: []; params?: {} }
    'transactions.index': { paramsTuple?: []; params?: {} }
    'transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'reports.month': { paramsTuple?: []; params?: {} }
    'reports.trend': { paramsTuple?: []; params?: {} }
    'reports.category': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'reports.balances': { paramsTuple?: []; params?: {} }
    'goals.index': { paramsTuple?: []; params?: {} }
    'goals.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.projection': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'insights.show': { paramsTuple: [ParamValue]; params: {'month': ParamValue} }
    'imports.index': { paramsTuple?: []; params?: {} }
    'imports.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'rules.index': { paramsTuple?: []; params?: {} }
    'spa.fallback': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
  }
  POST: {
    'auth.signup': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.email.verify': { paramsTuple?: []; params?: {} }
    'auth.password.forgot': { paramsTuple?: []; params?: {} }
    'auth.password.reset': { paramsTuple?: []; params?: {} }
    'auth.invitations.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'auth.logout_all': { paramsTuple?: []; params?: {} }
    'auth.email.resend': { paramsTuple?: []; params?: {} }
    'auth.email.verifyCode': { paramsTuple?: []; params?: {} }
    'households.store': { paramsTuple?: []; params?: {} }
    'household.restore': { paramsTuple?: []; params?: {} }
    'household.delete': { paramsTuple?: []; params?: {} }
    'household.leave': { paramsTuple?: []; params?: {} }
    'household.invitations.store': { paramsTuple?: []; params?: {} }
    'household.invitations.resend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.store': { paramsTuple?: []; params?: {} }
    'accounts.cards.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.store': { paramsTuple?: []; params?: {} }
    'categories.store': { paramsTuple?: []; params?: {} }
    'transactions.store': { paramsTuple?: []; params?: {} }
    'transactions.quick': { paramsTuple?: []; params?: {} }
    'transactions.bulkCategorize': { paramsTuple?: []; params?: {} }
    'transfers.store': { paramsTuple?: []; params?: {} }
    'goals.store': { paramsTuple?: []; params?: {} }
    'insights.generate': { paramsTuple: [ParamValue]; params: {'month': ParamValue} }
    'imports.store': { paramsTuple?: []; params?: {} }
    'imports.classify': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.confirm': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'rules.store': { paramsTuple?: []; params?: {} }
    'rules.apply': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'uploads.presign': { paramsTuple?: []; params?: {} }
    'receipts.scan': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'me.update': { paramsTuple?: []; params?: {} }
    'household.update': { paramsTuple?: []; params?: {} }
    'accounts.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'imports.rows.update': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'rowId': ParamValue} }
    'rules.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'household.invitations.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.cards.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'cardId': ParamValue} }
    'category_groups.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'rules.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'accounts.reorder': { paramsTuple?: []; params?: {} }
    'category_groups.reorder': { paramsTuple?: []; params?: {} }
    'categories.reorder': { paramsTuple?: []; params?: {} }
    'transactions.splits.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'goals.reorder': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}