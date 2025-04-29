
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'out',
// images: {
//   unoptimized: true,
// },
// trailingSlash: true, // Makes file paths more predictable

// // Remove assetPrefix as it causes issues with next/font

  // // Configure webpack for better electron integration
  // webpack: (config: any, { isServer }: any) => {
  //   if (!isServer) {
  //     // Make JS paths relative for electron file:// protocol
  //     config.output.publicPath = '';
  //   }
  //   return config;
  // },
};

module.exports = nextConfig;