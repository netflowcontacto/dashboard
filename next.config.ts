import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera .next/standalone con solo lo necesario para correr: hace que la
  // imagen de Docker pese decenas de MB en vez de cientos.
  output: "standalone",
  experimental: {
    // Un informe de Ads Manager con desglose por día pasa holgado el megabyte
    // que Next permite por defecto en una server action, y el error que tira
    // no dice que el problema sea el tamaño.
    serverActions: { bodySizeLimit: "8mb" },
  },
  poweredByHeader: false,
  compress: true,

};

export default nextConfig;
