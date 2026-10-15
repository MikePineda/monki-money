/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health.ready': {
    methods: ["GET","HEAD"],
    pattern: '/api/health',
    tokens: [{"old":"/api/health","type":0,"val":"api","end":""},{"old":"/api/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health.ready']['types'],
  },
  'health.live': {
    methods: ["GET","HEAD"],
    pattern: '/api/health/live',
    tokens: [{"old":"/api/health/live","type":0,"val":"api","end":""},{"old":"/api/health/live","type":0,"val":"health","end":""},{"old":"/api/health/live","type":0,"val":"live","end":""}],
    types: placeholder as Registry['health.live']['types'],
  },
  'config.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/config',
    tokens: [{"old":"/api/v1/config","type":0,"val":"api","end":""},{"old":"/api/v1/config","type":0,"val":"v1","end":""},{"old":"/api/v1/config","type":0,"val":"config","end":""}],
    types: placeholder as Registry['config.show']['types'],
  },
  'auth.signup': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['auth.signup']['types'],
  },
  'auth.login': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.login']['types'],
  },
  'auth.email.verify': {
    methods: ["POST"],
    pattern: '/api/v1/auth/email/verify',
    tokens: [{"old":"/api/v1/auth/email/verify","type":0,"val":"api","end":""},{"old":"/api/v1/auth/email/verify","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/email/verify","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/email/verify","type":0,"val":"email","end":""},{"old":"/api/v1/auth/email/verify","type":0,"val":"verify","end":""}],
    types: placeholder as Registry['auth.email.verify']['types'],
  },
  'auth.password.forgot': {
    methods: ["POST"],
    pattern: '/api/v1/auth/password/forgot',
    tokens: [{"old":"/api/v1/auth/password/forgot","type":0,"val":"api","end":""},{"old":"/api/v1/auth/password/forgot","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/password/forgot","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/password/forgot","type":0,"val":"password","end":""},{"old":"/api/v1/auth/password/forgot","type":0,"val":"forgot","end":""}],
    types: placeholder as Registry['auth.password.forgot']['types'],
  },
  'auth.password.reset': {
    methods: ["POST"],
    pattern: '/api/v1/auth/password/reset',
    tokens: [{"old":"/api/v1/auth/password/reset","type":0,"val":"api","end":""},{"old":"/api/v1/auth/password/reset","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/password/reset","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/password/reset","type":0,"val":"password","end":""},{"old":"/api/v1/auth/password/reset","type":0,"val":"reset","end":""}],
    types: placeholder as Registry['auth.password.reset']['types'],
  },
  'auth.invitations.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/auth/invitations/:token',
    tokens: [{"old":"/api/v1/auth/invitations/:token","type":0,"val":"api","end":""},{"old":"/api/v1/auth/invitations/:token","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/invitations/:token","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/invitations/:token","type":0,"val":"invitations","end":""},{"old":"/api/v1/auth/invitations/:token","type":1,"val":"token","end":""}],
    types: placeholder as Registry['auth.invitations.show']['types'],
  },
  'auth.invitations.accept': {
    methods: ["POST"],
    pattern: '/api/v1/auth/invitations/:token/accept',
    tokens: [{"old":"/api/v1/auth/invitations/:token/accept","type":0,"val":"api","end":""},{"old":"/api/v1/auth/invitations/:token/accept","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/invitations/:token/accept","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/invitations/:token/accept","type":0,"val":"invitations","end":""},{"old":"/api/v1/auth/invitations/:token/accept","type":1,"val":"token","end":""},{"old":"/api/v1/auth/invitations/:token/accept","type":0,"val":"accept","end":""}],
    types: placeholder as Registry['auth.invitations.accept']['types'],
  },
  'auth.me': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/auth/me',
    tokens: [{"old":"/api/v1/auth/me","type":0,"val":"api","end":""},{"old":"/api/v1/auth/me","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/me","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['auth.me']['types'],
  },
  'auth.logout': {
    methods: ["POST"],
    pattern: '/api/v1/auth/logout',
    tokens: [{"old":"/api/v1/auth/logout","type":0,"val":"api","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['auth.logout']['types'],
  },
  'auth.logout_all': {
    methods: ["POST"],
    pattern: '/api/v1/auth/logout-all',
    tokens: [{"old":"/api/v1/auth/logout-all","type":0,"val":"api","end":""},{"old":"/api/v1/auth/logout-all","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/logout-all","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/logout-all","type":0,"val":"logout-all","end":""}],
    types: placeholder as Registry['auth.logout_all']['types'],
  },
  'auth.email.resend': {
    methods: ["POST"],
    pattern: '/api/v1/auth/email/resend',
    tokens: [{"old":"/api/v1/auth/email/resend","type":0,"val":"api","end":""},{"old":"/api/v1/auth/email/resend","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/email/resend","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/email/resend","type":0,"val":"email","end":""},{"old":"/api/v1/auth/email/resend","type":0,"val":"resend","end":""}],
    types: placeholder as Registry['auth.email.resend']['types'],
  },
  'auth.email.verifyCode': {
    methods: ["POST"],
    pattern: '/api/v1/auth/email/verify-code',
    tokens: [{"old":"/api/v1/auth/email/verify-code","type":0,"val":"api","end":""},{"old":"/api/v1/auth/email/verify-code","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/email/verify-code","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/email/verify-code","type":0,"val":"email","end":""},{"old":"/api/v1/auth/email/verify-code","type":0,"val":"verify-code","end":""}],
    types: placeholder as Registry['auth.email.verifyCode']['types'],
  },
  'me.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/me',
    tokens: [{"old":"/api/v1/me","type":0,"val":"api","end":""},{"old":"/api/v1/me","type":0,"val":"v1","end":""},{"old":"/api/v1/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['me.update']['types'],
  },
  'household.restore': {
    methods: ["POST"],
    pattern: '/api/v1/household/restore',
    tokens: [{"old":"/api/v1/household/restore","type":0,"val":"api","end":""},{"old":"/api/v1/household/restore","type":0,"val":"v1","end":""},{"old":"/api/v1/household/restore","type":0,"val":"household","end":""},{"old":"/api/v1/household/restore","type":0,"val":"restore","end":""}],
    types: placeholder as Registry['household.restore']['types'],
  },
  'household.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/household',
    tokens: [{"old":"/api/v1/household","type":0,"val":"api","end":""},{"old":"/api/v1/household","type":0,"val":"v1","end":""},{"old":"/api/v1/household","type":0,"val":"household","end":""}],
    types: placeholder as Registry['household.show']['types'],
  },
  'household.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/household',
    tokens: [{"old":"/api/v1/household","type":0,"val":"api","end":""},{"old":"/api/v1/household","type":0,"val":"v1","end":""},{"old":"/api/v1/household","type":0,"val":"household","end":""}],
    types: placeholder as Registry['household.update']['types'],
  },
  'household.members': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/household/members',
    tokens: [{"old":"/api/v1/household/members","type":0,"val":"api","end":""},{"old":"/api/v1/household/members","type":0,"val":"v1","end":""},{"old":"/api/v1/household/members","type":0,"val":"household","end":""},{"old":"/api/v1/household/members","type":0,"val":"members","end":""}],
    types: placeholder as Registry['household.members']['types'],
  },
  'household.export': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/household/export',
    tokens: [{"old":"/api/v1/household/export","type":0,"val":"api","end":""},{"old":"/api/v1/household/export","type":0,"val":"v1","end":""},{"old":"/api/v1/household/export","type":0,"val":"household","end":""},{"old":"/api/v1/household/export","type":0,"val":"export","end":""}],
    types: placeholder as Registry['household.export']['types'],
  },
  'household.delete': {
    methods: ["POST"],
    pattern: '/api/v1/household/delete',
    tokens: [{"old":"/api/v1/household/delete","type":0,"val":"api","end":""},{"old":"/api/v1/household/delete","type":0,"val":"v1","end":""},{"old":"/api/v1/household/delete","type":0,"val":"household","end":""},{"old":"/api/v1/household/delete","type":0,"val":"delete","end":""}],
    types: placeholder as Registry['household.delete']['types'],
  },
  'household.invitations.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/household/invitations',
    tokens: [{"old":"/api/v1/household/invitations","type":0,"val":"api","end":""},{"old":"/api/v1/household/invitations","type":0,"val":"v1","end":""},{"old":"/api/v1/household/invitations","type":0,"val":"household","end":""},{"old":"/api/v1/household/invitations","type":0,"val":"invitations","end":""}],
    types: placeholder as Registry['household.invitations.index']['types'],
  },
  'household.invitations.store': {
    methods: ["POST"],
    pattern: '/api/v1/household/invitations',
    tokens: [{"old":"/api/v1/household/invitations","type":0,"val":"api","end":""},{"old":"/api/v1/household/invitations","type":0,"val":"v1","end":""},{"old":"/api/v1/household/invitations","type":0,"val":"household","end":""},{"old":"/api/v1/household/invitations","type":0,"val":"invitations","end":""}],
    types: placeholder as Registry['household.invitations.store']['types'],
  },
  'household.invitations.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/household/invitations/:id',
    tokens: [{"old":"/api/v1/household/invitations/:id","type":0,"val":"api","end":""},{"old":"/api/v1/household/invitations/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/household/invitations/:id","type":0,"val":"household","end":""},{"old":"/api/v1/household/invitations/:id","type":0,"val":"invitations","end":""},{"old":"/api/v1/household/invitations/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['household.invitations.destroy']['types'],
  },
  'household.invitations.resend': {
    methods: ["POST"],
    pattern: '/api/v1/household/invitations/:id/resend',
    tokens: [{"old":"/api/v1/household/invitations/:id/resend","type":0,"val":"api","end":""},{"old":"/api/v1/household/invitations/:id/resend","type":0,"val":"v1","end":""},{"old":"/api/v1/household/invitations/:id/resend","type":0,"val":"household","end":""},{"old":"/api/v1/household/invitations/:id/resend","type":0,"val":"invitations","end":""},{"old":"/api/v1/household/invitations/:id/resend","type":1,"val":"id","end":""},{"old":"/api/v1/household/invitations/:id/resend","type":0,"val":"resend","end":""}],
    types: placeholder as Registry['household.invitations.resend']['types'],
  },
  'accounts.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/accounts',
    tokens: [{"old":"/api/v1/accounts","type":0,"val":"api","end":""},{"old":"/api/v1/accounts","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts","type":0,"val":"accounts","end":""}],
    types: placeholder as Registry['accounts.index']['types'],
  },
  'accounts.store': {
    methods: ["POST"],
    pattern: '/api/v1/accounts',
    tokens: [{"old":"/api/v1/accounts","type":0,"val":"api","end":""},{"old":"/api/v1/accounts","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts","type":0,"val":"accounts","end":""}],
    types: placeholder as Registry['accounts.store']['types'],
  },
  'accounts.reorder': {
    methods: ["PUT"],
    pattern: '/api/v1/accounts/reorder',
    tokens: [{"old":"/api/v1/accounts/reorder","type":0,"val":"api","end":""},{"old":"/api/v1/accounts/reorder","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts/reorder","type":0,"val":"accounts","end":""},{"old":"/api/v1/accounts/reorder","type":0,"val":"reorder","end":""}],
    types: placeholder as Registry['accounts.reorder']['types'],
  },
  'accounts.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/accounts/:id',
    tokens: [{"old":"/api/v1/accounts/:id","type":0,"val":"api","end":""},{"old":"/api/v1/accounts/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts/:id","type":0,"val":"accounts","end":""},{"old":"/api/v1/accounts/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['accounts.show']['types'],
  },
  'accounts.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/accounts/:id',
    tokens: [{"old":"/api/v1/accounts/:id","type":0,"val":"api","end":""},{"old":"/api/v1/accounts/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts/:id","type":0,"val":"accounts","end":""},{"old":"/api/v1/accounts/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['accounts.update']['types'],
  },
  'accounts.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/accounts/:id',
    tokens: [{"old":"/api/v1/accounts/:id","type":0,"val":"api","end":""},{"old":"/api/v1/accounts/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts/:id","type":0,"val":"accounts","end":""},{"old":"/api/v1/accounts/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['accounts.destroy']['types'],
  },
  'accounts.cards.store': {
    methods: ["POST"],
    pattern: '/api/v1/accounts/:id/cards',
    tokens: [{"old":"/api/v1/accounts/:id/cards","type":0,"val":"api","end":""},{"old":"/api/v1/accounts/:id/cards","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts/:id/cards","type":0,"val":"accounts","end":""},{"old":"/api/v1/accounts/:id/cards","type":1,"val":"id","end":""},{"old":"/api/v1/accounts/:id/cards","type":0,"val":"cards","end":""}],
    types: placeholder as Registry['accounts.cards.store']['types'],
  },
  'accounts.cards.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/accounts/:id/cards/:cardId',
    tokens: [{"old":"/api/v1/accounts/:id/cards/:cardId","type":0,"val":"api","end":""},{"old":"/api/v1/accounts/:id/cards/:cardId","type":0,"val":"v1","end":""},{"old":"/api/v1/accounts/:id/cards/:cardId","type":0,"val":"accounts","end":""},{"old":"/api/v1/accounts/:id/cards/:cardId","type":1,"val":"id","end":""},{"old":"/api/v1/accounts/:id/cards/:cardId","type":0,"val":"cards","end":""},{"old":"/api/v1/accounts/:id/cards/:cardId","type":1,"val":"cardId","end":""}],
    types: placeholder as Registry['accounts.cards.destroy']['types'],
  },
  'category_groups.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/category-groups',
    tokens: [{"old":"/api/v1/category-groups","type":0,"val":"api","end":""},{"old":"/api/v1/category-groups","type":0,"val":"v1","end":""},{"old":"/api/v1/category-groups","type":0,"val":"category-groups","end":""}],
    types: placeholder as Registry['category_groups.index']['types'],
  },
  'category_groups.store': {
    methods: ["POST"],
    pattern: '/api/v1/category-groups',
    tokens: [{"old":"/api/v1/category-groups","type":0,"val":"api","end":""},{"old":"/api/v1/category-groups","type":0,"val":"v1","end":""},{"old":"/api/v1/category-groups","type":0,"val":"category-groups","end":""}],
    types: placeholder as Registry['category_groups.store']['types'],
  },
  'category_groups.reorder': {
    methods: ["PUT"],
    pattern: '/api/v1/category-groups/reorder',
    tokens: [{"old":"/api/v1/category-groups/reorder","type":0,"val":"api","end":""},{"old":"/api/v1/category-groups/reorder","type":0,"val":"v1","end":""},{"old":"/api/v1/category-groups/reorder","type":0,"val":"category-groups","end":""},{"old":"/api/v1/category-groups/reorder","type":0,"val":"reorder","end":""}],
    types: placeholder as Registry['category_groups.reorder']['types'],
  },
  'category_groups.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/category-groups/:id',
    tokens: [{"old":"/api/v1/category-groups/:id","type":0,"val":"api","end":""},{"old":"/api/v1/category-groups/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/category-groups/:id","type":0,"val":"category-groups","end":""},{"old":"/api/v1/category-groups/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['category_groups.update']['types'],
  },
  'category_groups.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/category-groups/:id',
    tokens: [{"old":"/api/v1/category-groups/:id","type":0,"val":"api","end":""},{"old":"/api/v1/category-groups/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/category-groups/:id","type":0,"val":"category-groups","end":""},{"old":"/api/v1/category-groups/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['category_groups.destroy']['types'],
  },
  'categories.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/categories',
    tokens: [{"old":"/api/v1/categories","type":0,"val":"api","end":""},{"old":"/api/v1/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['categories.index']['types'],
  },
  'categories.store': {
    methods: ["POST"],
    pattern: '/api/v1/categories',
    tokens: [{"old":"/api/v1/categories","type":0,"val":"api","end":""},{"old":"/api/v1/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['categories.store']['types'],
  },
  'categories.reorder': {
    methods: ["PUT"],
    pattern: '/api/v1/categories/reorder',
    tokens: [{"old":"/api/v1/categories/reorder","type":0,"val":"api","end":""},{"old":"/api/v1/categories/reorder","type":0,"val":"v1","end":""},{"old":"/api/v1/categories/reorder","type":0,"val":"categories","end":""},{"old":"/api/v1/categories/reorder","type":0,"val":"reorder","end":""}],
    types: placeholder as Registry['categories.reorder']['types'],
  },
  'categories.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/categories/:id',
    tokens: [{"old":"/api/v1/categories/:id","type":0,"val":"api","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"categories","end":""},{"old":"/api/v1/categories/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['categories.update']['types'],
  },
  'categories.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/categories/:id',
    tokens: [{"old":"/api/v1/categories/:id","type":0,"val":"api","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/categories/:id","type":0,"val":"categories","end":""},{"old":"/api/v1/categories/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['categories.destroy']['types'],
  },
  'transactions.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/transactions',
    tokens: [{"old":"/api/v1/transactions","type":0,"val":"api","end":""},{"old":"/api/v1/transactions","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions","type":0,"val":"transactions","end":""}],
    types: placeholder as Registry['transactions.index']['types'],
  },
  'transactions.store': {
    methods: ["POST"],
    pattern: '/api/v1/transactions',
    tokens: [{"old":"/api/v1/transactions","type":0,"val":"api","end":""},{"old":"/api/v1/transactions","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions","type":0,"val":"transactions","end":""}],
    types: placeholder as Registry['transactions.store']['types'],
  },
  'transactions.quick': {
    methods: ["POST"],
    pattern: '/api/v1/transactions/quick',
    tokens: [{"old":"/api/v1/transactions/quick","type":0,"val":"api","end":""},{"old":"/api/v1/transactions/quick","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions/quick","type":0,"val":"transactions","end":""},{"old":"/api/v1/transactions/quick","type":0,"val":"quick","end":""}],
    types: placeholder as Registry['transactions.quick']['types'],
  },
  'transactions.bulkCategorize': {
    methods: ["POST"],
    pattern: '/api/v1/transactions/bulk-categorize',
    tokens: [{"old":"/api/v1/transactions/bulk-categorize","type":0,"val":"api","end":""},{"old":"/api/v1/transactions/bulk-categorize","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions/bulk-categorize","type":0,"val":"transactions","end":""},{"old":"/api/v1/transactions/bulk-categorize","type":0,"val":"bulk-categorize","end":""}],
    types: placeholder as Registry['transactions.bulkCategorize']['types'],
  },
  'transactions.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/transactions/:id',
    tokens: [{"old":"/api/v1/transactions/:id","type":0,"val":"api","end":""},{"old":"/api/v1/transactions/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions/:id","type":0,"val":"transactions","end":""},{"old":"/api/v1/transactions/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['transactions.show']['types'],
  },
  'transactions.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/transactions/:id',
    tokens: [{"old":"/api/v1/transactions/:id","type":0,"val":"api","end":""},{"old":"/api/v1/transactions/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions/:id","type":0,"val":"transactions","end":""},{"old":"/api/v1/transactions/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['transactions.update']['types'],
  },
  'transactions.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/transactions/:id',
    tokens: [{"old":"/api/v1/transactions/:id","type":0,"val":"api","end":""},{"old":"/api/v1/transactions/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions/:id","type":0,"val":"transactions","end":""},{"old":"/api/v1/transactions/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['transactions.destroy']['types'],
  },
  'transactions.splits.update': {
    methods: ["PUT"],
    pattern: '/api/v1/transactions/:id/splits',
    tokens: [{"old":"/api/v1/transactions/:id/splits","type":0,"val":"api","end":""},{"old":"/api/v1/transactions/:id/splits","type":0,"val":"v1","end":""},{"old":"/api/v1/transactions/:id/splits","type":0,"val":"transactions","end":""},{"old":"/api/v1/transactions/:id/splits","type":1,"val":"id","end":""},{"old":"/api/v1/transactions/:id/splits","type":0,"val":"splits","end":""}],
    types: placeholder as Registry['transactions.splits.update']['types'],
  },
  'transfers.store': {
    methods: ["POST"],
    pattern: '/api/v1/transfers',
    tokens: [{"old":"/api/v1/transfers","type":0,"val":"api","end":""},{"old":"/api/v1/transfers","type":0,"val":"v1","end":""},{"old":"/api/v1/transfers","type":0,"val":"transfers","end":""}],
    types: placeholder as Registry['transfers.store']['types'],
  },
  'transfers.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/transfers/:id',
    tokens: [{"old":"/api/v1/transfers/:id","type":0,"val":"api","end":""},{"old":"/api/v1/transfers/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/transfers/:id","type":0,"val":"transfers","end":""},{"old":"/api/v1/transfers/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['transfers.update']['types'],
  },
  'transfers.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/transfers/:id',
    tokens: [{"old":"/api/v1/transfers/:id","type":0,"val":"api","end":""},{"old":"/api/v1/transfers/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/transfers/:id","type":0,"val":"transfers","end":""},{"old":"/api/v1/transfers/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['transfers.destroy']['types'],
  },
  'reports.month': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/reports/month',
    tokens: [{"old":"/api/v1/reports/month","type":0,"val":"api","end":""},{"old":"/api/v1/reports/month","type":0,"val":"v1","end":""},{"old":"/api/v1/reports/month","type":0,"val":"reports","end":""},{"old":"/api/v1/reports/month","type":0,"val":"month","end":""}],
    types: placeholder as Registry['reports.month']['types'],
  },
  'reports.trend': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/reports/trend',
    tokens: [{"old":"/api/v1/reports/trend","type":0,"val":"api","end":""},{"old":"/api/v1/reports/trend","type":0,"val":"v1","end":""},{"old":"/api/v1/reports/trend","type":0,"val":"reports","end":""},{"old":"/api/v1/reports/trend","type":0,"val":"trend","end":""}],
    types: placeholder as Registry['reports.trend']['types'],
  },
  'reports.category': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/reports/category/:id',
    tokens: [{"old":"/api/v1/reports/category/:id","type":0,"val":"api","end":""},{"old":"/api/v1/reports/category/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/reports/category/:id","type":0,"val":"reports","end":""},{"old":"/api/v1/reports/category/:id","type":0,"val":"category","end":""},{"old":"/api/v1/reports/category/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['reports.category']['types'],
  },
  'reports.balances': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/reports/balances',
    tokens: [{"old":"/api/v1/reports/balances","type":0,"val":"api","end":""},{"old":"/api/v1/reports/balances","type":0,"val":"v1","end":""},{"old":"/api/v1/reports/balances","type":0,"val":"reports","end":""},{"old":"/api/v1/reports/balances","type":0,"val":"balances","end":""}],
    types: placeholder as Registry['reports.balances']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
