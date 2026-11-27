import { describe, it, expect } from 'vitest'
import type { AgentMC, BridgeDocuments, DocumentGrant, DocumentHandle } from '../types/bridge.js'
import { createTestContext } from '../testing/index.js'

// ─── Compile-time canary for the documents namespace ─────────────────────────
//
// Same idiom as bridge-events-shape.test.ts: a DELIBERATE second declaration of
// the shape the AMC host actually exposes on `window.AgentMC.documents`, so a
// drift fails `pnpm run typecheck` rather than a plugin at runtime.
//
// Transcribed from the host at `origin/master` **5e21344351b4**, from the files
// that together are the real contract:
//   - args:    src/shared/plugin-capabilities/args.ts (`DOCUMENTS_SCHEMAS`)
//   - returns: src/main/ipc/plugin-bridge/document-handles.ts (`DocumentHandle`)
//              src/main/ipc/plugin-bridge/documents-handler.ts (the per-`case` returns)
//              src/main/ipc/plugin-bridge/word-to-pdf.ts (`WordToPdfResult`)
//   - surface: src/preload/plugin-bridge-preload.ts, whose runtime bag is built
//              from `PRELOAD_CALLS` (src/shared/plugin-capabilities/
//              preload-surface.generated.ts); the hand-written `PluginBridgeApi`
//              interface can lag that list, and `documents.wordToPdf` is one key
//              it lags, so this transcription follows the runtime surface
//
// Read out of the HOST, never out of this SDK's own types or mocks — that is the
// inversion fixtures/host-mirror.ts exists to warn about. Three claims in the
// originating ticket (jlstradingco/pdf-viewer-plugin#45) are wrong against this
// ref and are deliberately NOT reproduced; types/bridge.ts documents what the
// host actually does.
//
// HONEST LIMITS, both real:
//   1. Nothing binds the two repos, so this cannot detect the host changing
//      underneath us. When you update this mirror, re-read the host source and
//      bump the commit above — do not "fix" it to match whatever the SDK says.
//   2. `Eq` cannot catch a transposition of `append`'s `handleId` and `base64`.
//      Both are `string`, so the swap is type-identical and NO type-level
//      assertion can see it. The JSDoc calls the order out instead.
//
// LOAD-BEARING: this file is typechecked only via tsconfig.typecheck.json
// (`pnpm run typecheck`) — `pnpm -r build` excludes src/__tests__, so a canary
// checked only by the build is silently unchecked.
type HostDocumentHandle = {
  id: string
  name: string
  size: number
  mode: 'read' | 'readwrite'
  url: string
}

type HostDocumentGrant = {
  grantId: string
  name: string
  mode: 'read' | 'readwrite'
  lastOpenedAt: string
}

type HostWordToPdfFinding = {
  severity: 'block' | 'warn'
  code: string
  detail: string
}

type HostWordToPdfResult = {
  blocked: boolean
  findings: HostWordToPdfFinding[]
  pdf: string | null
}

type HostDocuments = {
  open(options: {
    mode: 'read' | 'readwrite'
    title?: string
    filters?: { name: string; extensions: string[] }[]
    multiple?: boolean
    remember?: boolean
  }): Promise<HostDocumentHandle[]>
  list(): Promise<HostDocumentHandle[]>
  stat(handleId: string): Promise<{ length: number }>
  wordToPdf(handleId: string): Promise<HostWordToPdfResult>
  append(
    handleId: string,
    base64: string,
    options: { expectedLength: number }
  ): Promise<{ length: number }>
  close(handleId: string): Promise<void>
  grants(): Promise<HostDocumentGrant[]>
  reopen(grantId: string): Promise<HostDocumentHandle>
  saveCopy(options: {
    name: string
    base64: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ saved: false } | { saved: true; names: string[] }>
  saveCopies(options: {
    files: { name: string; base64: string }[]
    title?: string
  }): Promise<{ saved: false } | { saved: true; names: string[] }>
  forget(grantId: string): Promise<void>
}

// INVARIANCE, not `extends` — a bidirectional `extends` pair looks strict but
// compares method parameters bivariantly and ignores optionality entirely. See
// bridge-events-shape.test.ts, where exactly that blindness bit once already.
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : never

type _AssertDocumentsMatchesHost = Eq<BridgeDocuments, HostDocuments>
const _documentsMatchesHost: _AssertDocumentsMatchesHost = true
void _documentsMatchesHost

type _AssertHandleMatchesHost = Eq<DocumentHandle, HostDocumentHandle>
const _handleMatchesHost: _AssertHandleMatchesHost = true
void _handleMatchesHost

// Grants are their own shape, transcribed from the host's `grants` case return —
// a drift there is invisible to the documents assertion only if it happens to
// break the namespace's invariance too, so it gets its own line.
type _AssertGrantMatchesHost = Eq<DocumentGrant, HostDocumentGrant>
const _grantMatchesHost: _AssertGrantMatchesHost = true
void _grantMatchesHost

// The namespace must be REACHABLE on the bridge surface, not merely exported
// beside it — an interface nothing hangs off is a type a plugin cannot call.
type _AssertAgentMcExposesDocuments = AgentMC['documents'] extends BridgeDocuments ? true : never
const _agentMcExposesDocuments: _AssertAgentMcExposesDocuments = true
void _agentMcExposesDocuments

// ─── Runtime: documents is WEBVIEW-only and must stay off the backend context ──
//
// The host reaches documents only through the webview bridge — its backend `ctx`
// is assembled without one (plugin-worker-entry.ts), and there is no `documents`
// row in the permission map because the namespace is self-gated: the file picker
// IS the consent. Typing it on PluginContext would promise a plugin's backend a
// capability it cannot call, and because both SDK mocks are annotated
// PluginContext, that mistake would land the moment someone "helpfully" added it.
// This is the runtime half of that guard; the compile-time half is that
// types/context.ts is untouched.
describe('documents stays off the backend context', () => {
  it('createTestContext exposes no documents namespace', () => {
    const h = createTestContext()

    expect('documents' in h.ctx).toBe(false)
  })
})
