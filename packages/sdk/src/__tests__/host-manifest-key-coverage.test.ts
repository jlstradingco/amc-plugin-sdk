import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { z } from 'zod'
import { manifestSchema } from '../validators/manifest.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOST_SCHEMA_FILE = path.join(here, '..', 'generated', 'manifest.schema.json')
const SDK_TYPES_FILE = path.join(here, '..', 'types', 'manifest.ts')

const HOST_PATH_FLOOR = 90
const KNOWN_HOST_PATH = 'ui.sessions.suggestedPrompts[].prompt'

const SURFACES = ['validator', 'type'] as const

type Surface = (typeof SURFACES)[number]

interface SdkOnlyPath {
  path: string
  surfaces: readonly Surface[]
  reason: string
}

const SDK_ONLY_PATHS: readonly SdkOnlyPath[] = [
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

interface JsonSchemaNode {
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode
  additionalProperties?: JsonSchemaNode | boolean
}

function childPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`
}

function jsonSchemaPaths(node: JsonSchemaNode, prefix = ''): string[] {
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

function unwrapZod(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) return unwrapZod(schema.innerType())
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrapZod(schema.unwrap())
  if (schema instanceof z.ZodDefault) return unwrapZod(schema.removeDefault())
  return schema
}

function zodPaths(schema: z.ZodTypeAny, prefix = ''): string[] {
  const inner = unwrapZod(schema)
  if (inner instanceof z.ZodObject) {
    return Object.entries(inner.shape as Record<string, z.ZodTypeAny>).flatMap(([key, child]) => {
      const keyPath = childPath(prefix, key)
      return [keyPath, ...zodPaths(child, keyPath)]
    })
  }
  if (inner instanceof z.ZodArray) return zodPaths(inner.element, `${prefix}[]`)
  if (inner instanceof z.ZodRecord) return zodPaths(inner.valueSchema, `${prefix}.*`)
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
  const recordValue = checker.getIndexInfoOfType(value, ts.IndexKind.String)
  if (recordValue && properties.length === 0) return typePaths(checker, recordValue.type, `${prefix}.*`)
  return properties.flatMap((property) => {
    const keyPath = childPath(prefix, property.name)
    return [keyPath, ...typePaths(checker, checker.getTypeOfSymbol(property), keyPath)]
  })
}

function publishedTypePaths(): string[] {
  const program = ts.createProgram([SDK_TYPES_FILE], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(SDK_TYPES_FILE)
  const moduleSymbol = source && checker.getSymbolAtLocation(source)
  const manifest = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === 'PluginManifest')
  if (!manifest) throw new Error(`${SDK_TYPES_FILE} exports no PluginManifest`)
  return typePaths(checker, checker.getDeclaredTypeOfSymbol(manifest))
}

function isUnder(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}.`) || candidate.startsWith(`${root}[]`)
}

function registeredFor(surface: Surface): string[] {
  return SDK_ONLY_PATHS.filter((entry) => entry.surfaces.includes(surface)).map((entry) => entry.path)
}

const hostPaths = new Set(
  jsonSchemaPaths(JSON.parse(fs.readFileSync(HOST_SCHEMA_FILE, 'utf-8')) as JsonSchemaNode)
)

const surfacePaths: Record<Surface, Set<string>> = {
  validator: new Set(zodPaths(manifestSchema)),
  type: new Set(publishedTypePaths()),
}

const surfaceFiles: Record<Surface, string> = {
  validator: 'validators/manifest.ts',
  type: 'types/manifest.ts',
}

describe('manifest key coverage against the generated host schema', () => {
  it('reads every surface instead of passing on an empty comparison', () => {
    expect(hostPaths.size).toBeGreaterThanOrEqual(HOST_PATH_FLOOR)
    expect(hostPaths.has(KNOWN_HOST_PATH), `${HOST_SCHEMA_FILE} lost ${KNOWN_HOST_PATH}`).toBe(true)
    for (const surface of SURFACES) {
      expect(surfacePaths[surface].has(KNOWN_HOST_PATH), `${surfaceFiles[surface]} lost ${KNOWN_HOST_PATH}`).toBe(true)
    }
  })

  it.each(SURFACES)('the %s declares every key path the host schema declares', (surface) => {
    const missing = [...hostPaths].filter((hostPath) => !surfacePaths[surface].has(hostPath))
    expect(
      missing,
      `The host accepts these manifest keys but ${surfaceFiles[surface]} does not declare them, so ` +
        `amc-plugin validate strips them unchecked and authors get no type for them. Add each one ` +
        `with the host's exact rules (src/shared/plugin-manifest-schema.ts).`
    ).toEqual([])
  })

  it.each(SURFACES)('the %s declares no key path the host lacks, beyond its registered SDK-only blocks', (surface) => {
    const registered = registeredFor(surface)
    const extra = [...surfacePaths[surface]].filter(
      (sdkPath) => !hostPaths.has(sdkPath) && !registered.some((root) => isUnder(sdkPath, root))
    )
    expect(
      extra,
      `${surfaceFiles[surface]} declares keys the host strips. Remove them, or register them in ` +
        `SDK_ONLY_PATHS with the reason the SDK keeps them.`
    ).toEqual([])
  })

  it.each(SDK_ONLY_PATHS.map((entry) => [entry.path, entry] as const))('registered SDK-only path %s is still SDK-only', (_path, entry) => {
    expect(hostPaths.has(entry.path), `the host now declares ${entry.path}; delete its SDK_ONLY_PATHS row`).toBe(false)
    for (const surface of entry.surfaces) {
      expect(
        surfacePaths[surface].has(entry.path),
        `${surfaceFiles[surface]} no longer declares ${entry.path}; delete it from that row (${entry.reason})`
      ).toBe(true)
    }
  })
})
