/**
 * Supabase REST API 调用层（带缓存）
 */
const config = require('../config');

const SUPA_URL = config.supabase.url;
const SUPA_KEY = config.supabase.anonKey;

const baseHeaders = {
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`
};

async function get(path, extraHeaders = {}) {
  const url = `${SUPA_URL}/rest/v1/${path}`;
  const res = await fetch(url, { headers: { ...baseHeaders, ...extraHeaders } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res;
}

// ---- 内存缓存（TTL 60秒） ----
const cache = {};
const CACHE_TTL = 60 * 1000; // 60 秒

function cached(key, fetcher) {
  const now = Date.now();
  if (cache[key] && now - cache[key].time < CACHE_TTL) {
    return cache[key].data;
  }
  throw { needsRefresh: true, key, fetcher };
}

async function refreshCache(key, fetcher) {
  const data = await fetcher();
  cache[key] = { data, time: Date.now() };
  return data;
}

// ---- 缓存：分类/颜色/尺寸/部件（几乎不变，缓存10分钟） ----
const LOOKUP_TTL = 10 * 60 * 1000;

async function getLookup(table, keyField, valueField) {
  const cacheKey = `lookup_${table}`;
  const now = Date.now();
  if (cache[cacheKey] && now - cache[cacheKey].time < LOOKUP_TTL) {
    return cache[cacheKey].data;
  }
  const { data } = await select(table, { select: '*' });
  const map = {};
  for (const r of data) map[r[keyField]] = valueField ? r[valueField] : r;
  cache[cacheKey] = { data: map, time: Date.now() };
  return map;
}

// ---- 对外接口 ----
async function select(table, options = {}) {
  const parts = [`select=${encodeURIComponent(options.select || '*')}`];
  if (options.filters) for (const f of options.filters) parts.push(f);
  if (options.order) parts.push(`order=${encodeURIComponent(options.order)}`);
  if (options.limit) parts.push(`limit=${options.limit}`);
  if (options.offset) parts.push(`offset=${options.offset}`);

  const res = await get(`${table}?${parts.join('&')}`, { 'Prefer': 'count=exact' });
  const data = await res.json();

  const cr = res.headers.get('content-range');
  let total = null;
  if (cr) { const m = cr.match(/\/(\d+)/); if (m) total = parseInt(m[1], 10); }

  return { data, total };
}

async function count(table, filters = []) {
  const parts = ['select=count'];
  for (const f of filters) parts.push(f);
  const res = await get(`${table}?${parts.join('&')}`, { 'Prefer': 'count=exact' });
  const cr = res.headers.get('content-range');
  if (cr) { const m = cr.match(/\/(\d+)/); if (m) return parseInt(m[1], 10); }
  return 0;
}

async function selectOne(table, field, value) {
  const filter = `${field}=eq.${encodeURIComponent(value)}`;
  const res = await get(`${table}?select=*&${filter}&limit=1`);
  const data = await res.json();
  return data[0] || null;
}

// ---- 带缓存的查询 ----
async function getCategoryName(sid) {
  if (!sid) return '';
  const map = await getLookup('xys_clothingctgy', 'sid', 'name');
  return map[sid] || '';
}

async function getColorName(sid) {
  if (!sid) return '';
  const map = await getLookup('xys_color', 'sid', 'color');
  return map[sid] || '';
}

async function getSizeName(sid) {
  if (!sid) return '';
  const map = await getLookup('xys_size', 'sid', 'size');
  return map[sid] || '';
}

async function getPartsName(sid) {
  if (!sid) return '';
  const map = await getLookup('xys_parts', 'sid', 'name');
  return map[sid] || '';
}

module.exports = {
  select, count, selectOne,
  getCategoryName, getColorName, getSizeName, getPartsName
};
