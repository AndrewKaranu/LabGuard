import * as React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        {
          default: 'bg-primary/20 text-primary',
          success: 'bg-emerald-500/20 text-emerald-400',
          warning: 'bg-amber-500/20 text-amber-400',
          destructive: 'bg-red-500/20 text-red-400',
          outline: 'border border-border text-muted-foreground'
        }[variant],
        className
      )}
      {...props}
    />
  )
}
