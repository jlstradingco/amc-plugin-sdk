/**
 * The SDK's package names, newest first. The packages were renamed from `@agent-mc/*` to
 * `@omniscio/*` in 3.4.0; a plugin created before then still depends on the old names, and the
 * CLI keeps working for it.
 */
export const SDK_PACKAGE_NAMES = ['@omniscio/plugin-sdk', '@agent-mc/plugin-sdk'] as const
export const DEV_SHELL_PACKAGE_NAMES = ['@omniscio/plugin-dev-shell', '@agent-mc/plugin-dev-shell'] as const

/** The first name `lookup` answers for, with its answer, or null when none does. */
export function firstResolved<T>(
  names: readonly string[],
  lookup: (name: string) => T | null
): { name: string; value: T } | null {
  for (const name of names) {
    const value = lookup(name)
    if (value !== null) return { name, value }
  }
  return null
}
