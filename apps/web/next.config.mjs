/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  transpilePackages: ['@scf/validation', '@scf/api-contracts', '@scf/design-tokens'],
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3001'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
