/*
|--------------------------------------------------------------------------
| Health checks
|--------------------------------------------------------------------------
|
| Checks behind the readiness probe (GET /api/health). No disk-space check:
| the container is stateless and has no volume. The heap thresholds are
| relative to --max-old-space-size set in the Dockerfile.
|
| Built per run (cheap) instead of once at boot so the database check always
| uses the current connection client, including inside the test suite's
| global transactions.
|
*/

import db from '@adonisjs/lucid/services/db'
import { DbCheck } from '@adonisjs/lucid/database'
import { HealthChecks, MemoryHeapCheck } from '@adonisjs/core/health'

export function runHealthChecks() {
  return new HealthChecks()
    .register([
      new DbCheck(db.connection()).as('database'),
      new MemoryHeapCheck()
        .warnWhenExceedsPercentage(80)
        .failWhenExceedsPercentage(95)
        .as('memory_heap'),
    ])
    .run()
}
