/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Let Node load pdf-parse and its pdfjs-dist engine natively instead of
  // bundling them with webpack (their ESM interop breaks Next 14's bundle).
  serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};
export default nextConfig;
