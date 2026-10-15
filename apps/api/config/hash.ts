import app from '@adonisjs/core/services/app'
import { defineConfig, drivers } from '@adonisjs/core/hash'

/**
 * scrypt parameters (Node's crypto.scrypt). OWASP Password Storage Cheat
 * Sheet minimum: N = 2^17, r = 8, p = 1, which needs 128 * N * r = 128 MiB
 * of native memory per hash (outside the V8 heap), so maxMemory must be
 * above that. Logins are throttled, which also bounds concurrent hashes.
 * Hashes carry their own parameters: changing these never breaks old ones.
 */
export const PRODUCTION_SCRYPT = {
  // OWASP's lower-memory equivalent of N=2^17/p=1: 64 MiB of native memory
  // per hash instead of 128 MiB, so a burst of logins fits the 512 MB task.
  cost: 2 ** 16,
  blockSize: 8,
  parallelization: 2,
  maxMemory: 256 * 1024 * 1024,
}

/** Cheap parameters for the test suite and the E2E stack (NODE_ENV=test). */
export const TEST_SCRYPT = {
  cost: 2 ** 10,
  blockSize: 8,
  parallelization: 1,
  maxMemory: 32 * 1024 * 1024,
}

const hashConfig = defineConfig({
  default: 'scrypt',

  list: {
    scrypt: drivers.scrypt(app.inTest ? TEST_SCRYPT : PRODUCTION_SCRYPT),
  },
})

export default hashConfig

/**
 * Inferring types for the list of hashers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface HashersList extends InferHashers<typeof hashConfig> {}
}
