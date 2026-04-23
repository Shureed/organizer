/**
 * PhaseBadge.test.tsx
 *
 * Render tests for the PhaseBadge component.
 * Each phase value should render a pill with the correct label.
 * Null/undefined phase should render nothing (null return).
 *
 * Uses ReactDOM + happy-dom. Tests the component as a pure function
 * returning a JSX element, which we inspect directly via React.createElement.
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { PhaseBadge } from './PhaseBadge'
import type { NodePhase } from './PhaseBadge'

interface BadgeProps {
  style?: { color?: string; backgroundColor?: string; border?: string }
  children?: React.ReactNode
  className?: string
}

// PhaseBadge is a pure render function — call it directly and inspect the element.
function renderBadge(phase: NodePhase | null | undefined): (React.ReactElement<BadgeProps> & { type: string }) | null {
  return PhaseBadge({ phase }) as (React.ReactElement<BadgeProps> & { type: string }) | null
}

describe('PhaseBadge', () => {
  it('renders null for null phase', () => {
    expect(renderBadge(null)).toBeNull()
  })

  it('renders null for undefined phase', () => {
    expect(renderBadge(undefined)).toBeNull()
  })

  it('renders a span element for discovery phase', () => {
    const el = renderBadge('discovery')
    expect(el).not.toBeNull()
    expect(el?.type).toBe('span')
  })

  it('renders a span element for plan phase', () => {
    const el = renderBadge('plan')
    expect(el?.type).toBe('span')
  })

  it('renders a span element for executing phase', () => {
    const el = renderBadge('executing')
    expect(el?.type).toBe('span')
  })

  it('renders a span element for retro phase', () => {
    const el = renderBadge('retro')
    expect(el?.type).toBe('span')
  })

  it('discovery badge children contains "discovery"', () => {
    const el = renderBadge('discovery')
    expect(el?.props.children).toBe('discovery')
  })

  it('plan badge children contains "plan"', () => {
    const el = renderBadge('plan')
    expect(el?.props.children).toBe('plan')
  })

  it('executing badge children contains "executing"', () => {
    const el = renderBadge('executing')
    expect(el?.props.children).toBe('executing')
  })

  it('retro badge children contains "retro"', () => {
    const el = renderBadge('retro')
    expect(el?.props.children).toBe('retro')
  })

  it('discovery badge has blue color in style', () => {
    const el = renderBadge('discovery')
    expect(el?.props.style?.color).toContain('60a5fa')
  })

  it('plan badge has purple color in style', () => {
    const el = renderBadge('plan')
    expect(el?.props.style?.color).toContain('a78bfa')
  })

  it('executing badge has amber color in style', () => {
    const el = renderBadge('executing')
    expect(el?.props.style?.color).toContain('fb923c')
  })

  it('retro badge has green color in style', () => {
    const el = renderBadge('retro')
    expect(el?.props.style?.color).toContain('4ade80')
  })
})
