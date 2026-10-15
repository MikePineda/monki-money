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
    'me.update': { paramsTuple?: []; params?: {} }
    'household.restore': { paramsTuple?: []; params?: {} }
    'household.show': { paramsTuple?: []; params?: {} }
    'household.update': { paramsTuple?: []; params?: {} }
    'household.members': { paramsTuple?: []; params?: {} }
    'household.export': { paramsTuple?: []; params?: {} }
    'household.delete': { paramsTuple?: []; params?: {} }
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
    'household.restore': { paramsTuple?: []; params?: {} }
    'household.delete': { paramsTuple?: []; params?: {} }
    'household.invitations.store': { paramsTuple?: []; params?: {} }
    'household.invitations.resend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.store': { paramsTuple?: []; params?: {} }
    'accounts.cards.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.store': { paramsTuple?: []; params?: {} }
    'categories.store': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'me.update': { paramsTuple?: []; params?: {} }
    'household.update': { paramsTuple?: []; params?: {} }
    'accounts.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'category_groups.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'household.invitations.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'accounts.cards.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'cardId': ParamValue} }
    'category_groups.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'categories.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'accounts.reorder': { paramsTuple?: []; params?: {} }
    'category_groups.reorder': { paramsTuple?: []; params?: {} }
    'categories.reorder': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}