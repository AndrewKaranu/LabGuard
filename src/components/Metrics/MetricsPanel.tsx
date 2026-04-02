import { useStore } from '@/store'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

interface Props {
  experimentId: string
}

const EMPTY_METRICS: Record<string, never[]> = {}

const COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#60a5fa']

export function MetricsPanel({ experimentId }: Props) {
  const metrics = useStore((s) => s.metrics[experimentId] ?? EMPTY_METRICS)
  const entries = Object.entries(metrics)

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
        <p className="text-sm font-medium text-foreground mb-1">No metrics yet</p>
        <p className="text-xs max-w-xs">
          LabGuard auto-detects loss, accuracy, learning rate, and more from your
          training output. Make sure your script prints them.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full p-4">
      <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {entries.map(([name, points], idx) => (
          <MetricChart
            key={name}
            name={name}
            points={points}
            color={COLORS[idx % COLORS.length]}
          />
        ))}
      </div>
    </div>
  )
}

function MetricChart({
  name, points, color
}: {
  name: string
  points: { value: number; step: number }[]
  color: string
}) {
  const latest = points[points.length - 1]
  const data = points.map((p) => ({ step: p.step, value: p.value }))

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{name}</p>
        <p className="text-lg font-semibold tabular-nums" style={{ color }}>
          {latest.value < 0.001
            ? latest.value.toExponential(2)
            : latest.value.toFixed(4)}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
          <XAxis dataKey="step" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={50} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e2535', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
