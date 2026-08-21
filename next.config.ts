import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 빌드 때 만든 고유번호 색인은 코드에서 경로를 조립해 읽으므로 자동 추적에
  // 잡히지 않는다. 서버리스 번들에 함께 실리도록 직접 지정한다.
  outputFileTracingIncludes: {
    "/api/search": ["./data/corp-index.tsv"],
    "/company/[corpCode]": ["./data/corp-index.tsv"],
  },
};

export default nextConfig;
