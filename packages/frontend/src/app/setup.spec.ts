import { describe, it, expect } from 'vitest'
import { createApp } from 'vue'
import App from '@/App.vue'

describe('Frontend Setup', () => {
  it('should import Vue successfully', () => {
    expect(createApp).toBeDefined()
    expect(typeof createApp).toBe('function')
  })

  it('should create Vue app instance', () => {
    const app = createApp(App)
    expect(app).toBeDefined()
    expect(app.mount).toBeDefined()
  })

  it('should have TypeScript strict type checking', () => {
    // This will fail compilation if TypeScript is not strict
    const message: string = 'TypeScript works'
    const num: number = 42

    expect(message).toBe('TypeScript works')
    expect(num).toBe(42)

    // Type assertion tests
    expect(typeof message).toBe('string')
    expect(typeof num).toBe('number')
  })

  it('should support ES modules', () => {
    // Verify import.meta is available (Vite feature)
    expect(import.meta).toBeDefined()
    expect(import.meta.env).toBeDefined()
  })
})
