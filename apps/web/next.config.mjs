/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@nexa/shared'],
  reactStrictMode: false,
  images: { remotePatterns: [{ protocol: 'http', hostname: '**' }, { protocol: 'https', hostname: '**' }] },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
