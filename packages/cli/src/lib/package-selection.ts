import * as fs from 'node:fs'
import * as path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { manifestNotFound } from './output.js'

const PACKAGE_EXTENSION = '.amcplugin'
const TEST_LABEL = /-test\.\d+/i
const MANIFEST_MEMBER = 'manifest.json'

const END_OF_CENTRAL_DIR = 0x06054b50
const CENTRAL_DIR_ENTRY = 0x02014b50
const END_RECORD_MIN_BYTES = 22
const STORED = 0
const DEFLATED = 8

export interface PluginIdentity {
  id: string
  version: string
}

export type PackageSelection =
  | { kind: 'selected'; path: string }
  | { kind: 'none' }
  | { kind: 'refused'; message: string; suggestion: string }

export function packageFileName(identity: PluginIdentity): string {
  return `${identity.id}-${identity.version}${PACKAGE_EXTENSION}`
}

export function readPluginIdentity(dir: string): PluginIdentity {
  const manifestPath = path.join(dir, MANIFEST_MEMBER)
  if (!fs.existsSync(manifestPath)) manifestNotFound()
  const plugin = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))?.plugin
  return { id: String(plugin?.id ?? ''), version: String(plugin?.version ?? '') }
}

export function listPackageCandidates(dir: string): string[] {
  return [dir, path.join(dir, 'dist')].flatMap(folder =>
    fs.existsSync(folder)
      ? fs
          .readdirSync(folder)
          .filter(name => name.endsWith(PACKAGE_EXTENSION))
          .map(name => path.join(folder, name))
      : []
  )
}

function readZipMember(archive: Buffer, member: string): Buffer | null {
  const end = findEndRecord(archive)
  if (end < 0) return null
  const entryCount = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== CENTRAL_DIR_ENTRY) return null
    const method = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    const name = archive.toString('utf-8', offset + 46, offset + 46 + nameLength)
    if (name === member) return readLocalData(archive, localOffset, method, compressedSize)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return null
}

function findEndRecord(archive: Buffer): number {
  for (let i = archive.length - END_RECORD_MIN_BYTES; i >= 0; i--) {
    if (archive.readUInt32LE(i) === END_OF_CENTRAL_DIR) return i
  }
  return -1
}

function readLocalData(archive: Buffer, localOffset: number, method: number, compressedSize: number): Buffer | null {
  const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28)
  const raw = archive.subarray(dataStart, dataStart + compressedSize)
  if (method === STORED) return raw
  if (method === DEFLATED) return inflateRawSync(raw)
  return null
}

export function readPackagedVersion(file: string): string | null {
  try {
    const manifest = readZipMember(fs.readFileSync(file), MANIFEST_MEMBER)
    if (!manifest) return null
    const version = JSON.parse(manifest.toString('utf-8'))?.plugin?.version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

function refuse(message: string, suggestion: string): PackageSelection {
  return { kind: 'refused', message, suggestion }
}

function display(dir: string, file: string): string {
  return path.relative(dir, file) || file
}

function refuseWrongFile(dir: string, file: string, identity: PluginIdentity): PackageSelection {
  const expected = packageFileName(identity)
  const name = path.basename(file)
  const kind = TEST_LABEL.test(name) ? 'a test build' : 'not this release'
  return refuse(
    `${display(dir, file)} is ${kind}: this release is ${identity.id} ${identity.version}, so the file must be named ${expected}`,
    `Publish ${expected}: pass it with --package <path>, or run 'amc-plugin package' and remove the other .amcplugin files first.`
  )
}

function checkContents(dir: string, file: string, identity: PluginIdentity): PackageSelection | null {
  const packaged = readPackagedVersion(file)
  const expected = packageFileName(identity)
  if (packaged === null) {
    return refuse(
      `Could not read manifest.json inside ${display(dir, file)}, so its version cannot be checked`,
      `Rebuild it with 'amc-plugin package' and publish ${expected}.`
    )
  }
  if (TEST_LABEL.test(packaged)) {
    return refuse(
      `${display(dir, file)} contains version ${packaged}, a test build label`,
      `Store releases stay plain (${identity.version}). Re-package with manifest.json at ${identity.version} and publish ${expected}.`
    )
  }
  if (packaged !== identity.version) {
    return refuse(
      `${display(dir, file)} contains version ${packaged}, but manifest.json declares ${identity.version}`,
      `Rebuild it with 'amc-plugin package' and publish ${expected}.`
    )
  }
  return null
}

function verifyPackage(dir: string, file: string, identity: PluginIdentity): PackageSelection {
  if (path.basename(file) !== packageFileName(identity)) return refuseWrongFile(dir, file, identity)
  return checkContents(dir, file, identity) ?? { kind: 'selected', path: file }
}

function pickOnlyCandidate(dir: string, identity: PluginIdentity): PackageSelection | string {
  const candidates = listPackageCandidates(dir)
  if (candidates.length === 0) return { kind: 'none' }
  if (candidates.length === 1) return candidates[0]
  const names = candidates.map(file => `  - ${display(dir, file)}`).join('\n')
  return refuse(
    `Found ${candidates.length} .amcplugin files, so there is no way to tell which one to publish:\n${names}`,
    `Name the one to publish: --package ${packageFileName(identity)}. The publish tool never picks one on its own.`
  )
}

export function selectPackage(dir: string, identity: PluginIdentity, explicit?: string): PackageSelection {
  if (TEST_LABEL.test(identity.version)) {
    return refuse(
      `manifest.json declares ${identity.version}, a test build label`,
      'Store releases carry a plain version. Set manifest.json back to the release version and re-package.'
    )
  }
  if (explicit !== undefined) {
    const file = path.resolve(dir, explicit)
    if (!fs.existsSync(file)) {
      return refuse(`--package ${explicit} does not exist`, `Pass the path to ${packageFileName(identity)}.`)
    }
    return verifyPackage(dir, file, identity)
  }
  const only = pickOnlyCandidate(dir, identity)
  return typeof only === 'string' ? verifyPackage(dir, only, identity) : only
}
