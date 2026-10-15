import safeRegex from 'safe-regex2'

/** Longest pattern a rule may have (regex or text). */
export const MAX_RULE_PATTERN_LENGTH = 200

const QUANTIFIER = /^(?:[*+]|\{\d*,\d*\}|\{\d+\})/

/**
 * Groups that are repeated (`(...)*`, `(...)+`, `(...){n,}`) and contain an
 * alternation at their own level: `(a|aa)+` backtracks exponentially when
 * the branches overlap, which star height alone does not catch.
 */
function hasRepeatedAlternation(pattern: string): boolean {
  const groups: Array<{ alternation: boolean }> = []
  let inClass = false

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    if (char === '\\') {
      index++
      continue
    }
    if (inClass) {
      if (char === ']') inClass = false
      continue
    }
    if (char === '[') inClass = true
    else if (char === '(') groups.push({ alternation: false })
    else if (char === '|' && groups.length > 0) groups[groups.length - 1].alternation = true
    else if (char === ')') {
      const group = groups.pop()
      if (group?.alternation && QUANTIFIER.test(pattern.slice(index + 1))) return true
    }
  }
  return false
}

/**
 * Whether a person's regex is safe to run on every imported row (rules
 * run synchronously inside requests): short, compiles, no nested
 * quantifiers (star height > 1, `(a+)+`), no repeated alternation
 * (`(a|aa)+`) and no backreferences. Rejected patterns never run.
 */
export function isSafeRulePattern(pattern: string): boolean {
  if (pattern.length > MAX_RULE_PATTERN_LENGTH) return false
  try {
    new RegExp(pattern, 'i')
  } catch {
    return false
  }
  if (/\\[1-9]|\\k</.test(pattern)) return false
  if (hasRepeatedAlternation(pattern)) return false
  return safeRegex(pattern, { limit: 10 })
}
