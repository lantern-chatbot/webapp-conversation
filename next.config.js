/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false, // enable browser source map generation during the production build
  // Configure pageExtensions to include md and mdx
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  experimental: {
    // appDir: true,
  },
  // Vercel provides its own output tracing. Keep standalone output for Docker only.
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
}

module.exports = nextConfig
