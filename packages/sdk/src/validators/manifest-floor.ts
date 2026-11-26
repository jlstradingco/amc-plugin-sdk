import { z } from 'zod'

export interface FloorBlock {
  entryPoint: string
  rpcAllow: string[]
  signIn: string
  signOut: string
  openBeforeSignIn: string[]
  personalDetails?: string[] | undefined
  methodLimits?: Record<string, number> | undefined
  pictureHosts?: string[] | undefined
}

export interface FloorProblem {
  path: Array<string | number>
  message: string
}

const FLOOR_METHOD_NAME = /^floor(?:\.[a-z][A-Za-z0-9]*){1,4}$/
const FLOOR_METHOD_NAME_MAX = 80
const FLOOR_RPC_ALLOW_MAX = 64
const FLOOR_OPEN_BEFORE_SIGN_IN_MAX = 8
const FLOOR_PICTURE_HOSTS_MAX = 10
const FLOOR_CALLS_PER_MINUTE_CEILING = 300
const FLOOR_ENTRY_POINT = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*\/)+[A-Za-z0-9_][A-Za-z0-9._-]*\.html$/
const EXACT_HOST_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const FLOOR_METHOD_NAME_MESSAGE =
  'floor method names must be written out in full, starting with "floor." (letters and digits, no patterns or wildcards)'
const FLOOR_HOST_MESSAGE =
  'pictureHosts entries must be one exact lowercase website name such as images.example.com, with no scheme, port, path, wildcard or IP address'
const FLOOR_ENTRY_POINT_MESSAGE =
  'floor.entryPoint must be an .html file inside its own subfolder of the package, such as dist/floor/index.html'
const FLOOR_NEEDS_BACKEND_MESSAGE =
  'a floor needs a backend: its methods run in the plugin background program'
const FLOOR_FOLDER_MESSAGE =
  'the floor folder must not contain the plugin background program, which staff devices could then download'

const floorMethodName = z
  .string()
  .max(FLOOR_METHOD_NAME_MAX)
  .regex(FLOOR_METHOD_NAME, FLOOR_METHOD_NAME_MESSAGE)

const floorPictureHost = z
  .string()
  .max(253)
  .refine((host) => EXACT_HOST_NAME.test(host) && !host.endsWith('.localhost'), {
    message: FLOOR_HOST_MESSAGE,
  })

export function buildFloorSchema(entryPoint: z.ZodType<string>) {
  return z
    .object({
      entryPoint,
      rpcAllow: z.array(floorMethodName).min(1).max(FLOOR_RPC_ALLOW_MAX),
      signIn: floorMethodName,
      signOut: floorMethodName,
      openBeforeSignIn: z.array(floorMethodName).min(1).max(FLOOR_OPEN_BEFORE_SIGN_IN_MAX),
      personalDetails: z.array(floorMethodName).max(FLOOR_RPC_ALLOW_MAX).optional(),
      methodLimits: z
        .record(floorMethodName, z.number().int().min(1).max(FLOOR_CALLS_PER_MINUTE_CEILING - 1))
        .optional(),
      pictureHosts: z.array(floorPictureHost).min(1).max(FLOOR_PICTURE_HOSTS_MAX).optional(),
    })
    .strict()
}

function floorFolder(entryPoint: string): string {
  return entryPoint.slice(0, entryPoint.lastIndexOf('/'))
}

function duplicateProblems(field: string, names: readonly string[]): FloorProblem[] {
  const repeated = new Set(names.filter((name, index) => names.indexOf(name) !== index))
  return [...repeated].map((name) => ({
    path: [field],
    message: `${field} lists "${name}" more than once`,
  }))
}

function unknownProblems(
  field: string,
  names: readonly string[],
  allowed: ReadonlySet<string>,
): FloorProblem[] {
  return names
    .filter((name) => !allowed.has(name))
    .map((name) => ({ path: [field], message: `${field} lists "${name}", which is not in rpcAllow` }))
}

function signInProblems(floor: FloorBlock, allowed: ReadonlySet<string>): FloorProblem[] {
  const problems: FloorProblem[] = []
  if (!allowed.has(floor.signIn)) {
    problems.push({ path: ['signIn'], message: 'signIn must be one of the methods in rpcAllow' })
  }
  if (!allowed.has(floor.signOut)) {
    problems.push({ path: ['signOut'], message: 'signOut must be one of the methods in rpcAllow' })
  }
  if (floor.signIn === floor.signOut) {
    problems.push({
      path: ['signOut'],
      message: 'signIn and signOut must be two different methods',
    })
  }
  if (!floor.openBeforeSignIn.includes(floor.signIn)) {
    problems.push({
      path: ['openBeforeSignIn'],
      message: 'openBeforeSignIn must include the signIn method, or nobody could ever sign in',
    })
  }
  if (floor.openBeforeSignIn.includes(floor.signOut)) {
    problems.push({
      path: ['openBeforeSignIn'],
      message: 'the signOut method needs a signed-in person, so it cannot be open before sign-in',
    })
  }
  return problems
}

function limitProblems(floor: FloorBlock, allowed: ReadonlySet<string>): FloorProblem[] {
  return Object.keys(floor.methodLimits ?? {})
    .filter((name) => !allowed.has(name))
    .map((name) => ({
      path: ['methodLimits', name],
      message: `methodLimits names "${name}", which is not in rpcAllow`,
    }))
}

function entryProblems(floor: FloorBlock, backendEntry: string | undefined): FloorProblem[] {
  if (!FLOOR_ENTRY_POINT.test(floor.entryPoint)) {
    return [{ path: ['entryPoint'], message: FLOOR_ENTRY_POINT_MESSAGE }]
  }
  if (backendEntry === undefined) return [{ path: [], message: FLOOR_NEEDS_BACKEND_MESSAGE }]
  if (backendEntry.startsWith(`${floorFolder(floor.entryPoint)}/`)) {
    return [{ path: ['entryPoint'], message: FLOOR_FOLDER_MESSAGE }]
  }
  return []
}

export function floorBlockProblems(
  floor: FloorBlock,
  backendEntry: string | undefined,
): FloorProblem[] {
  const allowed = new Set(floor.rpcAllow)
  const open = floor.openBeforeSignIn
  const personal = floor.personalDetails ?? []
  return [
    ...duplicateProblems('rpcAllow', floor.rpcAllow),
    ...signInProblems(floor, allowed),
    ...unknownProblems('openBeforeSignIn', open, allowed),
    ...duplicateProblems('openBeforeSignIn', open),
    ...unknownProblems('personalDetails', personal, allowed),
    ...duplicateProblems('personalDetails', personal),
    ...limitProblems(floor, allowed),
    ...duplicateProblems('pictureHosts', floor.pictureHosts ?? []),
    ...entryProblems(floor, backendEntry),
  ]
}
