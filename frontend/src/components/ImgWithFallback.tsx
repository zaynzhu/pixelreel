import { useState } from "react";

interface ImgWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallback: React.ReactNode;
}

export function ImgWithFallback({ src, alt, className, loading = "lazy", fallback }: ImgWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
