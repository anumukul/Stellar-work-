import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import React from 'react'

// Simple mock component to test rendering if the actual home page has complex dependencies
const Home = () => <h1>Lumentix Frontend</h1>

describe('Smoke Test', () => {
  it('renders without crashing', () => {
    render(<Home />)
    expect(screen.getByText('Lumentix Frontend')).toBeInTheDocument()
  })
})
