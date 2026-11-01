import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./data/**/*"],
  },
  serverExternalPackages: [
    "@tensorflow-models/blazeface",
    "@tensorflow/tfjs-backend-cpu",
    "@tensorflow/tfjs-converter",
    "@tensorflow/tfjs-core",
    "sharp",
  ],
};

export default nextConfig;
