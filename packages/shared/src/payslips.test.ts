import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAYSLIP_MAX_DEDUCTIONS, payslipNetCents } from './payslips.ts'

test('payslipNetCents is the gross minus every deduction', () => {
  assert.equal(payslipNetCents(500_000, [125_000, 5_000]), 370_000)
})

test('payslipNetCents of a payslip without deductions is the gross', () => {
  assert.equal(payslipNetCents(500_000, []), 500_000)
})

test('payslipNetCents goes negative when the deductions exceed the gross', () => {
  assert.equal(payslipNetCents(1_000, [600, 500]), -100)
})

test('a payslip allows up to three deduction lines', () => {
  assert.equal(PAYSLIP_MAX_DEDUCTIONS, 3)
})
