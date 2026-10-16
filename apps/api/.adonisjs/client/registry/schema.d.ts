/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'health.ready': {
    methods: ["GET","HEAD"]
    pattern: '/api/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_checks_controller').default['ready']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_checks_controller').default['ready']>>>
    }
  }
  'health.live': {
    methods: ["GET","HEAD"]
    pattern: '/api/health/live'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_checks_controller').default['live']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_checks_controller').default['live']>>>
    }
  }
  'config.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/config'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_config_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_config_controller').default['show']>>>
    }
  }
  'auth.signup': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').signupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').signupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/signup_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/signup_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.login': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.email.verify': {
    methods: ["POST"]
    pattern: '/api/v1/auth/email/verify'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').verifyEmailValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').verifyEmailValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_verification_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_verification_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.password.forgot': {
    methods: ["POST"]
    pattern: '/api/v1/auth/password/forgot'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').forgotPasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').forgotPasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.password.reset': {
    methods: ["POST"]
    pattern: '/api/v1/auth/password/reset'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').resetPasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').resetPasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.invitations.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/auth/invitations/:token'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/household').invitationTokenValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invitation_acceptance_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invitation_acceptance_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.invitations.accept': {
    methods: ["POST"]
    pattern: '/api/v1/auth/invitations/:token/accept'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').acceptInvitationValidator)>>
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/household').acceptInvitationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invitation_acceptance_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invitation_acceptance_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/auth/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['show']>>>
    }
  }
  'auth.logout': {
    methods: ["POST"]
    pattern: '/api/v1/auth/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['destroy']>>>
    }
  }
  'auth.logout_all': {
    methods: ["POST"]
    pattern: '/api/v1/auth/logout-all'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['destroyAll']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sessions_controller').default['destroyAll']>>>
    }
  }
  'auth.email.resend': {
    methods: ["POST"]
    pattern: '/api/v1/auth/email/resend'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_verification_controller').default['resend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_verification_controller').default['resend']>>>
    }
  }
  'auth.email.verifyCode': {
    methods: ["POST"]
    pattern: '/api/v1/auth/email/verify-code'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').verifyEmailCodeValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').verifyEmailCodeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/email_verification_controller').default['verifyCode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/email_verification_controller').default['verifyCode']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'me.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/me'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').updateProfileValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').updateProfileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'households.store': {
    methods: ["POST"]
    pattern: '/api/v1/households'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').createHouseholdValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/household').createHouseholdValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/households_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/households_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'household.restore': {
    methods: ["POST"]
    pattern: '/api/v1/household/restore'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['restore']>>>
    }
  }
  'household.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/household'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['show']>>>
    }
  }
  'household.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/household'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').updateHouseholdValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/household').updateHouseholdValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'household.members': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/household/members'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['members']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['members']>>>
    }
  }
  'household.export': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/household/export'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/household').exportHouseholdValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['export']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['export']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'household.delete': {
    methods: ["POST"]
    pattern: '/api/v1/household/delete'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').deleteHouseholdValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/household').deleteHouseholdValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'household.leave': {
    methods: ["POST"]
    pattern: '/api/v1/household/leave'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_controller').default['leave']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_controller').default['leave']>>>
    }
  }
  'household.invitations.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/household/invitations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['index']>>>
    }
  }
  'household.invitations.store': {
    methods: ["POST"]
    pattern: '/api/v1/household/invitations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').createInvitationValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/household').createInvitationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'household.invitations.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/household/invitations/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').invitationParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/household').invitationParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'household.invitations.resend': {
    methods: ["POST"]
    pattern: '/api/v1/household/invitations/:id/resend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/household').invitationParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/household').invitationParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['resend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/household_invitations_controller').default['resend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/accounts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['index']>>>
    }
  }
  'accounts.store': {
    methods: ["POST"]
    pattern: '/api/v1/accounts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/accounts').createAccountValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/accounts').createAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.reorder': {
    methods: ["PUT"]
    pattern: '/api/v1/accounts/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/accounts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/accounts').accountParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/accounts/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/accounts').updateAccountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/accounts').updateAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/accounts/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/accounts').accountParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/accounts').accountParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/accounts_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.cards.store': {
    methods: ["POST"]
    pattern: '/api/v1/accounts/:id/cards'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/accounts').addCardValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/accounts').addCardValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/account_cards_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/account_cards_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'accounts.cards.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/accounts/:id/cards/:cardId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/accounts').cardParamsValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; cardId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/accounts').cardParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/account_cards_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/account_cards_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'category_groups.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/category-groups'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['index']>>>
    }
  }
  'category_groups.store': {
    methods: ["POST"]
    pattern: '/api/v1/category-groups'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/categories').createCategoryGroupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/categories').createCategoryGroupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'category_groups.reorder': {
    methods: ["PUT"]
    pattern: '/api/v1/category-groups/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'category_groups.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/category-groups/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/categories').updateCategoryGroupValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/categories').updateCategoryGroupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'category_groups.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/category-groups/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/categories').categoryGroupParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/categories').categoryGroupParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/category_groups_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/categories').listCategoriesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.store': {
    methods: ["POST"]
    pattern: '/api/v1/categories'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/categories').createCategoryValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/categories').createCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.reorder': {
    methods: ["PUT"]
    pattern: '/api/v1/categories/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/categories/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/categories').updateCategoryValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/categories').updateCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'categories.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/categories/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/categories').deleteCategoryValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/categories').deleteCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/transactions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/transactions').listTransactionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.store': {
    methods: ["POST"]
    pattern: '/api/v1/transactions'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transactions').createTransactionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/transactions').createTransactionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.quick': {
    methods: ["POST"]
    pattern: '/api/v1/transactions/quick'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transactions').quickTransactionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/transactions').quickTransactionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['quick']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['quick']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.bulkCategorize': {
    methods: ["POST"]
    pattern: '/api/v1/transactions/bulk-categorize'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transactions').bulkCategorizeValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/transactions').bulkCategorizeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['bulkCategorize']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['bulkCategorize']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/transactions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/transactions').transactionParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/transactions/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transactions').updateTransactionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/transactions').updateTransactionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/transactions/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transactions').transactionParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/transactions').transactionParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transactions.splits.update': {
    methods: ["PUT"]
    pattern: '/api/v1/transactions/:id/splits'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transactions').updateSplitsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/transactions').updateSplitsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transaction_splits_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transaction_splits_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transfers.store': {
    methods: ["POST"]
    pattern: '/api/v1/transfers'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transfers').createTransferValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/transfers').createTransferValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transfers.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/transfers/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transfers').updateTransferValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/transfers').updateTransferValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transfers.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/transfers/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transfers').transferParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/transfers').transferParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'payslips.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/payslips'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/payslips').listPayslipsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'payslips.store': {
    methods: ["POST"]
    pattern: '/api/v1/payslips'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/payslips').createPayslipValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/payslips').createPayslipValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'payslips.candidates': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/payslips/candidates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/payslips').payslipCandidatesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['candidates']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['candidates']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'payslips.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/payslips/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/payslips').payslipParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/payslips').payslipParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/payslips_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'reports.month': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/reports/month'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/reports').monthReportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['month']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['month']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'reports.trend': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/reports/trend'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/reports').trendReportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['trend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['trend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'reports.category': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/reports/category/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/reports').categoryReportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['category']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['category']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'reports.balances': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/reports/balances'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['balances']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/reports_controller').default['balances']>>>
    }
  }
  'goals.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/goals'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/goals').listGoalsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'goals.store': {
    methods: ["POST"]
    pattern: '/api/v1/goals'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/goals').createGoalValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/goals').createGoalValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'goals.reorder': {
    methods: ["PUT"]
    pattern: '/api/v1/goals/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/reorder').reorderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'goals.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/goals/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/goals').goalParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'goals.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/goals/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/goals').updateGoalValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/goals').updateGoalValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'goals.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/goals/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/goals').goalParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/goals').goalParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'goals.projection': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/goals/:id/projection'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/goals').goalParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['projection']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/goals_controller').default['projection']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'insights.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/insights/:month'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { month: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/insights').insightParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/insights_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/insights_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'insights.generate': {
    methods: ["POST"]
    pattern: '/api/v1/insights/:month/generate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/insights').generateInsightValidator)>>
      paramsTuple: [ParamValue]
      params: { month: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/insights').generateInsightValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/insights_controller').default['generate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/insights_controller').default['generate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/imports'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/imports').listImportsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.store': {
    methods: ["POST"]
    pattern: '/api/v1/imports'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/imports').uploadImportValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/imports').uploadImportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/imports/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/imports').showImportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.classify': {
    methods: ["POST"]
    pattern: '/api/v1/imports/:id/classify'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/imports').importParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/imports').importParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['classify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['classify']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.confirm': {
    methods: ["POST"]
    pattern: '/api/v1/imports/:id/confirm'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/imports').confirmImportValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/imports').confirmImportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['confirm']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['confirm']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/imports/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/imports').importParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/imports').importParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/imports_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'imports.rows.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/imports/:id/rows/:rowId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/imports').decideRowValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; rowId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/imports').decideRowValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/import_rows_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/import_rows_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'rules.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/rules'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['index']>>>
    }
  }
  'rules.store': {
    methods: ["POST"]
    pattern: '/api/v1/rules'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/merchant_rules').createRuleValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/merchant_rules').createRuleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'rules.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/rules/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/merchant_rules').updateRuleValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/merchant_rules').updateRuleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'rules.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/rules/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/merchant_rules').ruleParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/merchant_rules').ruleParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'rules.apply': {
    methods: ["POST"]
    pattern: '/api/v1/rules/:id/apply'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/merchant_rules').ruleParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/merchant_rules').ruleParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['apply']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/rules_controller').default['apply']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'recurring.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/recurring'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['index']>>>
    }
  }
  'recurring.store': {
    methods: ["POST"]
    pattern: '/api/v1/recurring'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/recurring').createRecurringValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/recurring').createRecurringValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'recurring.detect': {
    methods: ["POST"]
    pattern: '/api/v1/recurring/detect'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['detect']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['detect']>>>
    }
  }
  'recurring.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/recurring/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/recurring').updateRecurringValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/recurring').updateRecurringValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'recurring.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/recurring/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/recurring').recurringParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/recurring').recurringParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/recurring_controller').default['destroy']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'uploads.presign': {
    methods: ["POST"]
    pattern: '/api/v1/uploads/presign'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/uploads').presignUploadValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/uploads').presignUploadValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/uploads_controller').default['presign']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/uploads_controller').default['presign']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'receipts.scan': {
    methods: ["POST"]
    pattern: '/api/v1/receipts/scan'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/receipts').scanReceiptValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/receipts').scanReceiptValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/receipts_controller').default['scan']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/receipts_controller').default['scan']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
}
