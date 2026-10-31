const apiUpstream = process.env.API_UPSTREAM || "http://localhost:4000";

module.exports = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiUpstream}/api/v1/:path*` }];
  },
};
