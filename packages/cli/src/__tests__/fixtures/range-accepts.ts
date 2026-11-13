export function rangeAccepts(range: string, version: string): boolean {
  const parsed = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/.exec(range)
  if (!parsed) return false
  const [, operator, major, minor, patch] = parsed
  const [specMajor, specMinor, specPatch] = [major, minor, patch].map(Number)
  const [vMajor, vMinor, vPatch] = version.split('.').map(Number)
  if (operator === '^') {
    if (specMajor !== vMajor) return false
    if (vMinor !== specMinor) return vMinor > specMinor
    return vPatch >= specPatch
  }
  if (operator === '~') return specMajor === vMajor && specMinor === vMinor && vPatch >= specPatch
  return specMajor === vMajor && specMinor === vMinor && specPatch === vPatch
}
