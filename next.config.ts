import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera .next/standalone con solo lo necesario para correr: hace que la
  // imagen de Docker pese decenas de MB en vez de cientos.
  output: "standalone",
  poweredByHeader: false,
  compress: true,

};

export default nextConfig;
