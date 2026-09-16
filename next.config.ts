import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La salida standalone sirve SOLO para la imagen de Docker, donde hace que
  // pese decenas de MB en vez de cientos. En Netlify hay que apagarla: su
  // runtime arma el despliegue a su manera y con standalone los archivos que
  // pide el navegador terminan donde no los busca — la página carga, el
  // JavaScript no, y sale "Application error: a client-side exception".
  //
  // El Dockerfile exporta BUILD_TARGET=docker para recuperarla.
  output: process.env.BUILD_TARGET === "docker" ? "standalone" : undefined,
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
