import type {NextConfig} from 'next';

const shouldUseStandalone = process.platform !== 'win32' && process.env.VERCEL !== '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a minimal, self-contained .next/standalone server for Docker/Linux builds.
  // Windows local builds and Vercel deployments skip it to avoid symlink copy failures.
  ...(shouldUseStandalone ? { output: 'standalone' as const } : {}),
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify - file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;

