/**
 * Cloudflare Pages Function - API 入口
 * 处理所有 /api/* 请求
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ---- 统一错误响应 ----
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // ============================================
    //   路由分发
    // ============================================

    // GET /api/categories
    if (path === '/api/categories') {
      const data = await supaSelect(env, 'xys_clothingctgy', { select: '*', order: 'sort,parent' });
      return json(buildCategoryTree(data));
    }

    // GET /api/clothing
    if (path === '/api/clothing') {
      return json(await handleClothingList(url, env));
    }

    // GET /api/clothing/:id
    if (path.startsWith('/api/clothing/')) {
      const id = parseInt(path.split('/').pop(), 10);
      return json(await handleClothingDetail(id, env));
    }

    // GET /api/sizes
    if (path === '/api/sizes') {
      const { data } = await supaSelect(env, 'xys_size', { select: '*', order: 'id' });
      return json({ code: 0, data });
    }

    // GET /api/colors
    if (path === '/api/colors') {
      const { data } = await supaSelect(env, 'xys_color', { select: '*', order: 'id' });
      return json({ code: 0, data });
    }

    // 404
    return json({ code: 1, message: 'Not found' }, 404);

  } catch (err) {
    console.error(path, err.message);
    return json({ code: 1, message: err.message }, 500);
  }
}

// ============================================
//   Supabase REST API 请求
// ============================================
const baseHeaders = (env) => ({
  'apikey': env.SUPA_ANON_KEY,
  'Authorization': `Bearer ${env.SUPA_ANON_KEY}`
});

async function supaFetch(env, path, extraHeaders = {}) {
  const url = `https://txbrwudmvhrgfrsvaibc.supabase.co/rest/v1/${path}`;
  const res = await fetch(url, { headers: { ...baseHeaders(env), ...extraHeaders } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res;
}

async function supaSelect(env, table, options = {}) {
  const parts = [`select=${encodeURIComponent(options.select || '*')}`];
  if (options.filters) for (const f of options.filters) parts.push(f);
  if (options.order) parts.push(`order=${encodeURIComponent(options.order)}`);
  if (options.limit) parts.push(`limit=${options.limit}`);
  if (options.offset) parts.push(`offset=${options.offset}`);
  const res = await supaFetch(env, `${table}?${parts.join('&')}`, { 'Prefer': 'count=exact' });
  const data = await res.json();
  const cr = res.headers.get('content-range');
  let total = null;
  if (cr) { const m = cr.match(/\/(\d+)/); if (m) total = parseInt(m[1], 10); }
  return { data, total };
}

async function supaCount(env, table, filters = []) {
  const parts = ['select=count'];
  for (const f of filters) parts.push(f);
  const res = await supaFetch(env, `${table}?${parts.join('&')}`, { 'Prefer': 'count=exact' });
  const cr = res.headers.get('content-range');
  if (cr) { const m = cr.match(/\/(\d+)/); if (m) return parseInt(m[1], 10); }
  return 0;
}

async function supaOne(env, table, field, value) {
  const filter = `${field}=eq.${encodeURIComponent(value)}`;
  const res = await supaFetch(env, `${table}?select=*&${filter}&limit=1`);
  const data = await res.json();
  return data[0] || null;
}

// ---- 缓存（分类、颜色等小表，10分钟有效期） ----
const lookupCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

async function getLookupMap(env, table, keyField, valField) {
  const key = `lookup_${table}`;
  const now = Date.now();
  const cached = lookupCache.get(key);
  if (cached && now - cached.time < CACHE_TTL) return cached.map;
  const { data } = await supaSelect(env, table, { select: '*' });
  const map = {};
  for (const r of data) map[r[keyField]] = valField ? r[valField] : r;
  lookupCache.set(key, { map, time: Date.now() });
  return map;
}

async function catName(env, sid) {
  if (!sid) return '';
  const m = await getLookupMap(env, 'xys_clothingctgy', 'sid', 'name');
  return m[sid] || '';
}
async function colorName(env, sid) {
  if (!sid) return '';
  const m = await getLookupMap(env, 'xys_color', 'sid', 'color');
  return m[sid] || '';
}
async function sizeName(env, sid) {
  if (!sid) return '';
  const m = await getLookupMap(env, 'xys_size', 'sid', 'size');
  return m[sid] || '';
}
async function partsName(env, sid) {
  if (!sid) return '';
  const m = await getLookupMap(env, 'xys_parts', 'sid', 'name');
  return m[sid] || '';
}

// ============================================
//   分类树
// ============================================
function buildCategoryTree(rows) {
  const roots = [];
  const map = {};
  for (const item of rows) {
    if (item.level === 1) {
      roots.push({ ...item, children: [] });
    } else {
      const pKey = String(item.parent);
      if (!map[pKey]) map[pKey] = [];
      map[pKey].push({ ...item });
    }
  }
  for (const root of roots) {
    if (map[root.sid]) root.children = map[root.sid];
  }
  return { code: 0, data: roots };
}

// ============================================
//   服装列表
// ============================================
async function handleClothingList(url, env) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
  const offset = (page - 1) * pageSize;
  const r2Base = env.R2_BASE_URL || 'https://pub-4e5938738d134acea00813d130fc0d3f.r2.dev';
  const filters = [];

  // 分类筛选
  const catSid = url.searchParams.get('category');
  if (catSid) {
    filters.push(`category=in.(${catSid})`);
  }

  // 编码筛选
  const code = url.searchParams.get('code');
  if (code) {
    filters.push(`bianma=like.%${encodeURIComponent(code)}%`);
  }

  // 条码筛选
  const barcode = url.searchParams.get('barcode');
  if (barcode) {
    const { data: stockRows } = await supaSelect(env, 'xys_stock', {
      select: 'bm',
      filters: [`tm=like.%${encodeURIComponent(barcode)}%`]
    });
    const bms = [...new Set((stockRows || []).map(r => r.bm).filter(Boolean))];
    if (bms.length > 0) {
      filters.push(`bianma=in.(${bms.join(',')})`);
    } else {
      return { code: 0, data: { items: [], total: 0, page, pageSize, totalPages: 0 } };
    }
  }

  const { data: items, total } = await supaSelect(env, 'v_clothing_list', {
    select: '*',
    filters,
    order: 'id.desc',
    limit: pageSize,
    offset
  });

  for (const item of items || []) {
    item.imageUrl = item.pic ? `${r2Base}/${item.pic}` : '';
  }

  return {
    code: 0,
    data: { items: items || [], total: total || 0, page, pageSize, totalPages: Math.ceil((total || 0) / pageSize) }
  };
}

// ============================================
//   服装详情
// ============================================
async function handleClothingDetail(id, env) {
  const r2Base = env.R2_BASE_URL || 'https://pub-4e5938738d134acea00813d130fc0d3f.r2.dev';
  const item = await supaOne(env, 'v_clothing_list', 'id', id);
  if (!item) return { code: 1, message: '服装不存在' };

  item.imageUrl = item.pic ? `${r2Base}/${item.pic}` : '';
  if (!item.category_name) item.category_name = await catName(env, item.category);
  if (!item.color_name) item.color_name = await colorName(env, item.color);

  // 库存明细
  const { data: stockItems } = await supaSelect(env, 'xys_stock', {
    select: '*',
    filters: [`bm=eq.${item.bianma}`],
    order: 'size,partsid'
  });

  item.stockList = [];
  for (const s of stockItems || []) {
    item.stockList.push({
      ...s,
      size_name: await sizeName(env, s.size),
      parts_name: await partsName(env, s.partsid)
    });
  }

  // 重写 intro 图片路径
  if (item.intro) {
    item.intro = item.intro
      .replace(/src=["']ueditor\/php\/upload1\//g, `src="${r2Base}/ueditor/php/upload1/`)
      .replace(/src=["']ueditor\/php\/upload\//g, `src="${r2Base}/ueditor/php/upload/`);
  }

  return { code: 0, data: item };
}
