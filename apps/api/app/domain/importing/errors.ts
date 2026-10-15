/**
 * A bank value (date, amount) that cannot be read. Plain domain error: the
 * CSV parser catches it and rethrows a typed 422 with the line and column.
 */
export class InvalidBankValueError extends Error {
  constructor(
    readonly field: 'date' | 'amount',
    readonly value: string
  ) {
    super(`Invalid ${field}: "${value}"`)
    this.name = 'InvalidBankValueError'
  }
}
