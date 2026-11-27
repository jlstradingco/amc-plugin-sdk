import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifestSchema } from '../validators/manifest.js'
import {
  KEY_PATH_SURFACES,
  KEY_PATH_SURFACE_FILES,
  SDK_ONLY_PATHS,
  jsonSchemaPaths,
  manifestKeyPathDrift,
  publishedTypePaths,
  zodPaths,
  type JsonSchemaNode,
} from './manifest-key-coverage-core.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOST_SCHEMA_FILE = path.join(here, '..', 'generated', 'manifest.schema.json')
const SDK_TYPES_FILE = path.join(here, '..', 'types', 'manifest.ts')

const typePaths = publishedTypePaths(SDK_TYPES_FILE)

const drift = manifestKeyPathDrift({
  host: new Set(jsonSchemaPaths(JSON.parse(fs.readFileSync(HOST_SCHEMA_FILE, 'utf-8')) as JsonSchemaNode)),
  surfaces: {
    validator: new Set(zodPaths(manifestSchema)),
    type: new Set(typePaths ?? []),
  },
})

describe('manifest key coverage against the generated host schema', () => {
  it('reads every surface instead of passing on an empty comparison', () => {
    expect(typePaths, `${SDK_TYPES_FILE} exports no PluginManifest`).not.toBeNull()
    expect(drift.unread).toEqual([])
  })

  it.each(KEY_PATH_SURFACES)('the %s declares every key path the host schema declares', (surface) => {
    expect(
      drift.missing[surface],
      `The host accepts these manifest keys but ${KEY_PATH_SURFACE_FILES[surface]} does not declare them, so ` +
        `amc-plugin validate strips them unchecked and authors get no type for them. Add each one ` +
        `with the host's exact rules (src/shared/plugin-manifest-schema.ts).`
    ).toEqual([])
  })

  it.each(KEY_PATH_SURFACES)('the %s declares no key path the host lacks, beyond its registered SDK-only blocks', (surface) => {
    expect(
      drift.extra[surface],
      `${KEY_PATH_SURFACE_FILES[surface]} declares keys the host strips. Remove them, or register them in ` +
        `SDK_ONLY_PATHS with the reason the SDK keeps them.`
    ).toEqual([])
  })

  it.each(SDK_ONLY_PATHS.map((entry) => [entry.path] as const))('registered SDK-only path %s is still SDK-only', (sdkPath) => {
    expect(
      drift.staleSdkOnly.filter((row) => row.path === sdkPath),
      `the host now declares ${sdkPath}, or a surface no longer does; fix its SDK_ONLY_PATHS row`
    ).toEqual([])
  })
})
