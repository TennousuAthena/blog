import { describe, it, expect, vi } from 'vitest'
import { getComments } from './getComments'

describe('getComments slug normalization', () => {
  const createMockContext = (slug: string) => {
    const bindMock = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null)
    })
    
    const prepareMock = vi.fn().mockReturnValue({
      bind: bindMock
    })

    const c = {
      req: {
        query: (key: string) => {
           if (key === 'post_slug') return slug
           return undefined
        }
      },
      env: {
        CWD_DB: {
          prepare: prepareMock
        }
      },
      json: vi.fn(),
      executionCtx: {
        waitUntil: vi.fn()
      }
    } as any
    
    return { c, prepareMock, bindMock }
  }

  it('should query both variants for relative path without trailing slash', async () => {
    const { c, bindMock } = createMockContext('/1.html')
    
    await getComments(c)
    
    // We expect the bind to be called with arguments including both variants
    // The first call to bind should be for the main query (or we check all calls)
    const calls = bindMock.mock.calls
    const allArgs = calls.flat()
    
    expect(allArgs).toContain('/1.html')
    expect(allArgs).toContain('/1.html/')
  })

  it('should query both variants for relative path with trailing slash', async () => {
    const { c, bindMock } = createMockContext('/1.html/')
    
    await getComments(c)
    
    const calls = bindMock.mock.calls
    const allArgs = calls.flat()
    
    expect(allArgs).toContain('/1.html')
    expect(allArgs).toContain('/1.html/')
  })
  
  it('should query both variants for full URL', async () => {
    const { c, bindMock } = createMockContext('https://example.com/foo')
    
    await getComments(c)
    
    const calls = bindMock.mock.calls
    const allArgs = calls.flat()
    
    expect(allArgs).toContain('https://example.com/foo')
    expect(allArgs).toContain('https://example.com/foo/')
  })

  it('should handle root path correctly', async () => {
    const { c, bindMock } = createMockContext('/')
    
    await getComments(c)
    
    const calls = bindMock.mock.calls
    const allArgs = calls.flat()
    
    expect(allArgs).toContain('/')
  })
})
