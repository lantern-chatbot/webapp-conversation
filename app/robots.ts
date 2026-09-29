import type { MetadataRoute } from 'next'

// Embedded chat UI with nothing to index. Every page render is dynamic, so
// crawler traffic only adds cost; ask all crawlers to stay away.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
