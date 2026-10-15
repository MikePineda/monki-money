/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| Every route has a name (`.as()`): the names are the Tuyau contract the web
| app is typed against (see docs/CONTRACTS.md). After changing a route, run
| `npm run codegen` and commit `apps/api/.adonisjs`.
|
| Middleware chains:
| - authenticated: auth -> sessionVersion (revocation) -> per-user throttle
| - household:     authenticated -> verified email -> household context
|                  (ctx.household / ctx.membership)
|
| Routes with `:id` must load rows through `findInHousehold` (404 across
| households); tests/functional/tenant_isolation.spec.ts fails when a new
| `:id` route is not covered.
|
*/

import router from '@adonisjs/core/services/router'
import { apiThrottle } from '#start/limiter'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import { registerE2eRoutes } from '#start/routes/e2e'
import { testSupportEnabled } from '#services/e2e/test_support'

const id = router.matchers.number()

const authenticated = () => [middleware.auth(), middleware.sessionVersion(), apiThrottle]
const inHousehold = () => [...authenticated(), middleware.verified(), middleware.household()]

router
  .group(() => {
    // Probes live outside /v1 on purpose: infrastructure depends on them.
    router.get('health', [controllers.HealthChecks, 'ready']).as('health.ready')
    router.get('health/live', [controllers.HealthChecks, 'live']).as('health.live')

    router
      .group(() => {
        router.get('config', [controllers.PublicConfig, 'show']).as('config.show')

        /*
         * Public auth endpoints (CSRF still applies to every POST).
         */
        router
          .group(() => {
            router.post('signup', [controllers.Signup, 'store']).as('signup')
            router.post('login', [controllers.Sessions, 'store']).as('login')
            router.post('email/verify', [controllers.EmailVerification, 'store']).as('email.verify')
            router
              .post('password/forgot', [controllers.PasswordReset, 'store'])
              .as('password.forgot')
            router
              .post('password/reset', [controllers.PasswordReset, 'update'])
              .as('password.reset')
            router
              .get('invitations/:token', [controllers.InvitationAcceptance, 'show'])
              .as('invitations.show')
            router
              .post('invitations/:token/accept', [controllers.InvitationAcceptance, 'store'])
              .as('invitations.accept')
          })
          .prefix('auth')
          .as('auth')

        /*
         * Logged in, email not necessarily verified.
         */
        router
          .group(() => {
            router
              .group(() => {
                router.get('me', [controllers.Sessions, 'show']).as('me')
                router.post('logout', [controllers.Sessions, 'destroy']).as('logout')
                router.post('logout-all', [controllers.Sessions, 'destroyAll']).as('logout_all')
                router
                  .post('email/resend', [controllers.EmailVerification, 'resend'])
                  .as('email.resend')
              })
              .prefix('auth')
              .as('auth')

            router.patch('me', [controllers.Profile, 'update']).as('me.update')
          })
          .use(authenticated())

        /*
         * Restore is the only household route open while the household is
         * scheduled for deletion.
         */
        router
          .post('household/restore', [controllers.Household, 'restore'])
          .as('household.restore')
          .use([
            ...authenticated(),
            middleware.verified(),
            middleware.household({ allowPendingDeletion: true }),
          ])

        /*
         * Household resources.
         */
        router
          .group(() => {
            router
              .group(() => {
                router.get('/', [controllers.Household, 'show']).as('show')
                router.patch('/', [controllers.Household, 'update']).as('update')
                router.get('members', [controllers.Household, 'members']).as('members')
                router.get('export', [controllers.Household, 'export']).as('export')
                router.post('delete', [controllers.Household, 'destroy']).as('delete')

                router
                  .get('invitations', [controllers.HouseholdInvitations, 'index'])
                  .as('invitations.index')
                router
                  .post('invitations', [controllers.HouseholdInvitations, 'store'])
                  .as('invitations.store')
                router
                  .delete('invitations/:id', [controllers.HouseholdInvitations, 'destroy'])
                  .where('id', id)
                  .as('invitations.destroy')
                router
                  .post('invitations/:id/resend', [controllers.HouseholdInvitations, 'resend'])
                  .where('id', id)
                  .as('invitations.resend')
              })
              .prefix('household')
              .as('household')

            router
              .group(() => {
                router.get('/', [controllers.Accounts, 'index']).as('index')
                router.post('/', [controllers.Accounts, 'store']).as('store')
                router.put('reorder', [controllers.Accounts, 'reorder']).as('reorder')
                router.get(':id', [controllers.Accounts, 'show']).where('id', id).as('show')
                router.patch(':id', [controllers.Accounts, 'update']).where('id', id).as('update')
                router
                  .delete(':id', [controllers.Accounts, 'destroy'])
                  .where('id', id)
                  .as('destroy')
                router
                  .post(':id/cards', [controllers.AccountCards, 'store'])
                  .where('id', id)
                  .as('cards.store')
                router
                  .delete(':id/cards/:cardId', [controllers.AccountCards, 'destroy'])
                  .where('id', id)
                  .where('cardId', id)
                  .as('cards.destroy')
              })
              .prefix('accounts')
              .as('accounts')

            router
              .group(() => {
                router.get('/', [controllers.CategoryGroups, 'index']).as('index')
                router.post('/', [controllers.CategoryGroups, 'store']).as('store')
                router.put('reorder', [controllers.CategoryGroups, 'reorder']).as('reorder')
                router
                  .patch(':id', [controllers.CategoryGroups, 'update'])
                  .where('id', id)
                  .as('update')
                router
                  .delete(':id', [controllers.CategoryGroups, 'destroy'])
                  .where('id', id)
                  .as('destroy')
              })
              .prefix('category-groups')
              .as('category_groups')

            router
              .group(() => {
                router.get('/', [controllers.Categories, 'index']).as('index')
                router.post('/', [controllers.Categories, 'store']).as('store')
                router.put('reorder', [controllers.Categories, 'reorder']).as('reorder')
                router.patch(':id', [controllers.Categories, 'update']).where('id', id).as('update')
                router
                  .delete(':id', [controllers.Categories, 'destroy'])
                  .where('id', id)
                  .as('destroy')
              })
              .prefix('categories')
              .as('categories')
          })
          .use(inHousehold())
      })
      .prefix('v1')
  })
  .prefix('/api')

/**
 * Test-only routes (`/api/test/reset`, `/api/test/outbox`), registered only
 * under NODE_ENV=test or E2E_MODE. Never in production.
 */
if (testSupportEnabled()) {
  registerE2eRoutes(router)
}

/**
 * SPA fallback. MUST stay the last route: anything that is not an API route
 * or a static file gets index.html. Excluded from the Tuyau registry.
 */
router.get('*', [controllers.Spa, 'show']).as('spa.fallback')
