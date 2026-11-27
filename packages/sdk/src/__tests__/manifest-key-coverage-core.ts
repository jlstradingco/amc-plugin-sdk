import ts from 'typescript'
import { z } from 'zod'

export const HOST_PATH_FLOOR = 90
export const KNOWN_HOST_PATH = 'ui.sessions.suggestedPrompts[].prompt'

export const KEY_PATH_SURFACES = ['validator', 'type'] as const

export type KeyPathSurface = (typeof KEY_PATH_SURFACES)[number]

export const KEY_PATH_SURFACE_FILES: Record<KeyPathSurface, string> = {
  validator: 'validators/manifest.ts',
  type: 'types/manifest.ts',
}

export interface SdkOnlyPath {
  readonly path: string
  readonly surfaces: readonly KeyPathSurface[]
  readonly reason: string
}

export const SDK_ONLY_PATHS: readonly SdkOnlyPath[] = [
  {
    path: 'migrations',
    surfaces: ['validator'],
    reason: 'kept so old manifests still validate; the host has no migrations key and runs none',
  },
  {
    path: 'cron',
    surfaces: ['validator'],
    reason: 'kept so old manifests still validate; cron jobs are registered at runtime with ctx.cron',
  },
  {
    path: 'workspace',
    surfaces: ['validator'],
    reason: 'kept so old manifests still validate; the host never reads a workspace block',
  },
  {
    path: 'storage.collections.*.commandTableWaiver',
    surfaces: ['validator', 'type'],
    reason: 'read by the CLI ship check and marketplace review; the host strips it',
  },
]

export interface JsonSchemaNode {
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode
  additionalProperties?: JsonSchemaNode | boolean
}

function childPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`
}

export function jsonSchemaPaths(node: JsonSchemaNode, prefix = ''): string[] {
  const properties = Object.entries(node.properties ?? {}).flatMap(([key, child]) => {
    const keyPath = childPath(prefix, key)
    return [keyPath, ...jsonSchemaPaths(child, keyPath)]
  })
  const items = node.items ? jsonSchemaPaths(node.items, `${prefix}[]`) : []
  const values =
    typeof node.additionalProperties === 'object'
      ? jsonSchemaPaths(node.additionalProperties, `${prefix}.*`)
      : []
  return [...properties, ...items, ...values]
}

type ZodClass = abstract new (...args: never[]) => unknown

function isZod(schema: unknown, name: string): boolean {
  const ctor = (z as unknown as Record<string, ZodClass | undefined>)[name]
  return typeof ctor === 'function' && schema instanceof ctor
}

function unwrapZod(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapZod(schema.unwrap() as z.ZodTypeAny)
  }
  if (schema instanceof z.ZodDefault) return unwrapZod(schema.removeDefault() as z.ZodTypeAny)
  if (isZod(schema, 'ZodEffects')) {
    return unwrapZod((schema as unknown as { innerType(): z.ZodTypeAny }).innerType())
  }
  return schema
}

function recordValue(record: z.ZodTypeAny): z.ZodTypeAny {
  const shaped = record as unknown as { valueType?: z.ZodTypeAny; valueSchema?: z.ZodTypeAny }
  return (shaped.valueType ?? shaped.valueSchema) as z.ZodTypeAny
}

export function zodPaths(schema: z.ZodTypeAny, prefix = ''): string[] {
  const inner = unwrapZod(schema)
  if (inner instanceof z.ZodObject) {
    return Object.entries(inner.shape as Record<string, z.ZodTypeAny>).flatMap(([key, child]) => {
      const keyPath = childPath(prefix, key)
      return [keyPath, ...zodPaths(child, keyPath)]
    })
  }
  if (inner instanceof z.ZodArray) return zodPaths(inner.element as z.ZodTypeAny, `${prefix}[]`)
  if (inner instanceof z.ZodRecord) return zodPaths(recordValue(inner), `${prefix}.*`)
  return []
}

function typePaths(checker: ts.TypeChecker, type: ts.Type, prefix = ''): string[] {
  const value = checker.getNonNullableType(type)
  if (checker.isArrayType(value)) {
    const [element] = checker.getTypeArguments(value as ts.TypeReference)
    return element ? typePaths(checker, element, `${prefix}[]`) : []
  }
  if (!(value.flags & ts.TypeFlags.Object)) return []
  const properties = value.getProperties()
  const recordValueInfo = checker.getIndexInfoOfType(value, ts.IndexKind.String)
  if (recordValueInfo && properties.length === 0) {
    return typePaths(checker, recordValueInfo.type, `${prefix}.*`)
  }
  return properties.flatMap((property) => {
    const keyPath = childPath(prefix, property.name)
    return [keyPath, ...typePaths(checker, checker.getTypeOfSymbol(property), keyPath)]
  })
}

export function publishedTypePaths(typesFile: string): string[] | null {
  const program = ts.createProgram([typesFile], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(typesFile)
  const moduleSymbol = source && checker.getSymbolAtLocation(source)
  const manifest =
    moduleSymbol &&
    checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === 'PluginManifest')
  if (!manifest) return null
  return typePaths(checker, checker.getDeclaredTypeOfSymbol(manifest))
}

function isUnder(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}.`) || candidate.startsWith(`${root}[]`)
}

function registeredFor(surface: KeyPathSurface): string[] {
  return SDK_ONLY_PATHS.filter((entry) => entry.surfaces.includes(surface)).map((entry) => entry.path)
}

export interface KeyPathSheets {
  readonly host: ReadonlySet<string>
  readonly surfaces: Readonly<Record<KeyPathSurface, ReadonlySet<string>>>
}

export interface StaleSdkOnlyPath {
  readonly path: string
  readonly surface: KeyPathSurface | 'host'
  readonly reason: string
}

export interface KeyPathDrift {
  readonly unread: string[]
  readonly missing: Record<KeyPathSurface, string[]>
  readonly extra: Record<KeyPathSurface, string[]>
  readonly staleSdkOnly: StaleSdkOnlyPath[]
}

function unreadSurfaces(sheets: KeyPathSheets): string[] {
  const unread: string[] = []
  if (sheets.host.size < HOST_PATH_FLOOR) unread.push(`host schema (${sheets.host.size} < ${HOST_PATH_FLOOR})`)
  for (const surface of [...KEY_PATH_SURFACES]) {
    if (!sheets.surfaces[surface].has(KNOWN_HOST_PATH)) unread.push(`${surface} (lost ${KNOWN_HOST_PATH})`)
  }
  if (!sheets.host.has(KNOWN_HOST_PATH)) unread.push(`host schema (lost ${KNOWN_HOST_PATH})`)
  return unread
}

function staleRows(sheets: KeyPathSheets): StaleSdkOnlyPath[] {
  return SDK_ONLY_PATHS.flatMap((entry) => [
    ...(sheets.host.has(entry.path) ? [{ path: entry.path, surface: 'host' as const, reason: entry.reason }] : []),
    ...entry.surfaces
      .filter((surface) => !sheets.surfaces[surface].has(entry.path))
      .map((surface) => ({ path: entry.path, surface, reason: entry.reason })),
  ])
}

export function manifestKeyPathDrift(sheets: KeyPathSheets): KeyPathDrift {
  const missing = {} as Record<KeyPathSurface, string[]>
  const extra = {} as Record<KeyPathSurface, string[]>
  for (const surface of [...KEY_PATH_SURFACES]) {
    const declared = sheets.surfaces[surface]
    const registered = registeredFor(surface)
    missing[surface] = [...sheets.host].filter((hostPath) => !declared.has(hostPath))
    extra[surface] = [...declared].filter(
      (sdkPath) => !sheets.host.has(sdkPath) && !registered.some((root) => isUnder(sdkPath, root))
    )
  }
  return { unread: unreadSurfaces(sheets), missing, extra, staleSdkOnly: staleRows(sheets) }
}
