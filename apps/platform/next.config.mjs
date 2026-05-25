/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bm/ui", "@bm/config"],
  // Workspace TS packages use NodeNext-style `.js` specifiers in their source
  // (e.g. @bm/ui's `./receipt-preview.js`). Map those back to the `.ts` source
  // so webpack resolves them while transpiling the package.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ...(config.resolve.extensionAlias ?? {}),
    };
    return config;
  },
};
export default nextConfig;
