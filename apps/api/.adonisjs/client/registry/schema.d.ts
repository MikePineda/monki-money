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
}
