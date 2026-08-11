# Spend

Read-only AI cost and usage totals, for building spend reports.

**Availability:** Backend only (`ctx.spend`)
**Required Permission:** `spend`

::: warning This is the user's GLOBAL spend
`getBreakdown()` returns totals across **all** of the user's AI activity, not a slice scoped to your plugin. A plugin with the `spend` permission can see what every other plugin, and the user's own coding work, cost. Ask for it only if you are genuinely building a reporting surface, and say so in your plugin description.
:::

There is nothing to pass and no window to widen. The host resolves the time windows and the timezone itself.

## Methods

### `getBreakdown(): Promise<SpendReportBreakdown>`

The full breakdown: three rolling windows plus a drill-down on yesterday.

## Types

```typescript
interface SpendWindow {
  codingValue: number
  backgroundTotal: number
  outOfPocket: number
  codingOutOfPocket: number
}

interface SpendReportBreakdown {
  generatedAt: string
  windows: {
    yesterday: SpendWindow
    week: SpendWindow
    month: SpendWindow
  }
  codingEngines: SpendEngineLine[]
  backgroundFeatures: SpendFeatureLine[]
  notableCharges: SpendCharge[]
}
```

All money is **USD**.

| `SpendWindow` field | Meaning |
|---|---|
| `codingValue` | Agent-coding **shadow value** -- what the coding work would have cost at API rates. This is not a bill and nobody was charged it |
| `backgroundTotal` | Total metered background-feature spend, plan-covered and real combined |
| `outOfPocket` | The real out-of-pocket slice of `backgroundTotal`, billed to a real API key. **Background only** |
| `codingOutOfPocket` | The real out-of-pocket slice of the window's **coding** sessions -- own-key metered vendors or a real Anthropic API key. Disjoint from `outOfPocket`; zero when all coding ran on a subscription |

Reporting `codingValue` as money the user spent is the single easiest way to get this wrong -- it is a shadow value nobody was charged.

::: danger A window's real money is `outOfPocket + codingOutOfPocket`
`codingOutOfPocket` was **missing from this SDK entirely** until 2026-08-11, and this page
said `outOfPocket` was "the only figure that corresponds to an actual charge". It is not --
it is the *background* slice only. Anything that reported it alone as "what this cost you"
**under-reported real spend**, silently, by however much the user's own-key coding came to.

Add the two. Never fold `codingOutOfPocket` into `outOfPocket`.
:::

### Drill-down lines

```typescript
interface SpendEngineLine {
  engine: string
  value: number
  sessions: number
}

interface SpendFeatureLine {
  label: string
  total: number
  real: number
  count: number
}

interface SpendCharge {
  amount: number
  feature: string
  model: string
  apiKey: boolean
  count: number
  session: string | null
}
```

| Field | Meaning |
|---|---|
| `SpendFeatureLine.total` | Plan-covered and real combined, for that feature |
| `SpendFeatureLine.real` | The out-of-pocket slice of it |
| `SpendCharge.apiKey` | Whether the charge hit a real API key |
| `SpendCharge.count` | Charges deduped into this line, by `(feature, model, apiKey)` |

`notableCharges` is **empty unless yesterday's biggest single charge was at least $0.10**, so an empty array is the normal case for a quiet day -- not a failure.

## Example

```typescript
export function activate(ctx: PluginContext) {
  void ctx.cron.register('daily-spend', '0 9 * * *', async () => {
    const report = await ctx.spend.getBreakdown()
    const { outOfPocket, codingOutOfPocket, codingValue } = report.windows.yesterday
    // Real money is BOTH out-of-pocket terms. Neither alone is the total.
    const realMoney = outOfPocket + codingOutOfPocket

    // Say what each number is. They are not the same kind of thing.
    ctx.toast.notify({
      title: 'Yesterday',
      body: `$${realMoney.toFixed(2)} billed - $${codingValue.toFixed(2)} of coding at API rates`
    })

    const biggest = report.notableCharges[0]
    if (biggest) {
      ctx.log.info(`Largest charge: $${biggest.amount} (${biggest.feature}, ${biggest.model})`)
    }
  })
}
```

## Notes

- Read-only. There is no way to set a budget or a cap through this API.
- `generatedAt` is the host's snapshot time, not the time you called. Show it if you cache the report.
- Windows are resolved in the user's timezone by the host, so "yesterday" means their yesterday.

## Testing

`createTestContext()` defaults to an all-zero breakdown -- the shape a brand-new install reports -- stamped at the epoch so snapshot tests stay deterministic.

```typescript
const h = createTestContext({
  spend: {
    windows: {
      yesterday: { codingValue: 12.5, backgroundTotal: 3, outOfPocket: 1.25, codingOutOfPocket: 0.4 },
      week: { codingValue: 60, backgroundTotal: 10, outOfPocket: 4, codingOutOfPocket: 1.1 },
      month: { codingValue: 200, backgroundTotal: 40, outOfPocket: 15, codingOutOfPocket: 3.2 }
    }
  }
})

const report = await h.ctx.spend.getBreakdown()
// Seeded fields override; everything you leave out stays zeroed.
```
