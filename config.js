const config = {
  // ---- Supabase REST API 配置 ----
  supabase: {
    url: process.env.SUPA_URL || 'https://txbrwudmvhrgfrsvaibc.supabase.co',
    anonKey: process.env.SUPA_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4YnJ3dWRtdmhyZ2Zyc3ZhaWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwMDg0OTYsImV4cCI6MjA3NjU4NDQ5Nn0.L7I4G4eR9IEP6EDdt_gVTH2l-CWvNRGYNrA90MOi-54'
  },

  // ---- Cloudflare R2 图片配置 ----
  r2: {
    baseUrl: process.env.R2_BASE_URL || 'https://pub-4e5938738d134acea00813d130fc0d3f.r2.dev'
  },

  // ---- 分页配置 ----
  pageSize: 20,

  // ---- 服务器端口 (本地开发) ----
  port: parseInt(process.env.PORT || '3000', 10)
};

module.exports = config;
