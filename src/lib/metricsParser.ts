export interface ParsedMetrics {
  [key: string]: number
}

// HuggingFace Trainer logs JSON lines:
// {"loss": 0.342, "learning_rate": 5e-05, "epoch": 3.0}
function tryHfJson(line: string): ParsedMetrics | null {
  const match = line.match(/\{[^{}]*"(?:loss|eval_loss|learning_rate|epoch)"[^{}]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0])
    if (typeof obj === 'object' && obj !== null) {
      const out: ParsedMetrics = {}
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') out[k] = v
      }
      return Object.keys(out).length > 0 ? out : null
    }
  } catch { /* ignore */ }
  return null
}

// tqdm postfix: loss=0.342, acc=0.891, lr=1e-4
function tryTqdmPostfix(line: string): ParsedMetrics | null {
  // Look for patterns like: key=value inside brackets or after ']'
  const section = line.replace(/.*[\]|]/g, '')
  if (!section) return null
  const metrics: ParsedMetrics = {}
  const pattern = /\b(loss|acc(?:uracy)?|lr|f1|prec(?:ision)?|rec(?:all)?|auc|mse|mae|rmse|val_\w+)[\s:=]+([0-9]+\.?[0-9]*(?:e[+-]?[0-9]+)?)/gi
  let match
  while ((match = pattern.exec(section)) !== null) {
    metrics[match[1].toLowerCase()] = parseFloat(match[2])
  }
  return Object.keys(metrics).length > 0 ? metrics : null
}

// Plain print patterns:
// "Epoch [5/10], Step [100/1000], Loss: 0.342, Acc: 89.1%"
// "loss: 0.342" or "Loss = 0.342"
function tryKeyValuePairs(line: string): ParsedMetrics | null {
  const metrics: ParsedMetrics = {}
  const pattern = /\b(loss|accuracy|acc|lr|learning[_\s]?rate|f1|precision|recall|auc|mse|mae|rmse|epoch|step|val_\w+|train_\w+|eval_\w+)[\s:=]+([0-9]+\.?[0-9]*(?:e[+-]?[0-9]+)?)%?/gi
  let match
  while ((match = pattern.exec(line)) !== null) {
    const key = match[1].toLowerCase().replace(/[\s]/g, '_')
    metrics[key] = parseFloat(match[2])
  }
  return Object.keys(metrics).length > 0 ? metrics : null
}

// Extract epoch/step progress: "Epoch 5/10" or "Step 100/1000"
function tryProgress(line: string): ParsedMetrics | null {
  const metrics: ParsedMetrics = {}
  const epochMatch = line.match(/epoch\s+(\d+)\s*[/\|]\s*(\d+)/i)
  if (epochMatch) {
    metrics['epoch'] = parseInt(epochMatch[1])
    metrics['total_epochs'] = parseInt(epochMatch[2])
  }
  const stepMatch = line.match(/step\s+(\d+)\s*[/\|]\s*(\d+)/i)
  if (stepMatch) {
    metrics['step'] = parseInt(stepMatch[1])
  }
  return Object.keys(metrics).length > 0 ? metrics : null
}

export function parseLine(line: string): ParsedMetrics | null {
  // Clean ANSI codes first
  const clean = line.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim()
  if (!clean) return null

  return (
    tryHfJson(clean) ||
    tryTqdmPostfix(clean) ||
    tryKeyValuePairs(clean) ||
    tryProgress(clean)
  )
}
