import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
