/**
 * Express 应用入口
 * 使用 Supabase REST API (anon key), 不依赖任何数据库驱动
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('../config');
const supa = require('../lib/supa');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/ueditor/php/upload1', express.static(path.join(__dirname, '..', 'public', 'upload1')));
app.use('/ueditor/php/upload', express.static(path.join(__dirname, '..', 'public', 'upload1')));

// ============================================================
//   API 路由
// ============================================================

/**
 * GET /api/categories — 2 级分类树
 */
app.get('/api/categories', async (req, res) => {
  try {
    const { data: rows } = await supa.select('xys_clothingctgy', {
      select: '*',
      order: 'sort,parent'
    });

    const roots = [];
    const childrenMap = {};

    for (const item of rows) {
      if (item.level === 1) {
        roots.push({ ...item, children: [] });
      } else {
        const pKey = String(item.parent);
        if (!childrenMap[pKey]) childrenMap[pKey] = [];
        childrenMap[pKey].push({ ...item });
      }
    }

    for (const root of roots) {
      const rKey = String(root.sid);
      if (childrenMap[rKey]) root.children = childrenMap[rKey];
    }

    res.json({ code: 0, data: roots });
  } catch (err) {
    console.error('获取分类失败:', err);
    res.status(500).json({ code: 1, message: '获取分类失败', error: err.message });
  }
});

/**
 * GET /api/clothing — 分页查询（使用 v_clothing_list 视图，1次查询搞定）
 */
app.get('/api/clothing', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = parseInt(req.query.pageSize || String(config.pageSize), 10);
    const offset = (page - 1) * pageSize;

    const filters = [];
    const r2Base = config.r2.baseUrl;

    // -- 分类过滤（简化：category 存的是 sid，直接匹配） --
    if (req.query.category) {
      const catSid = parseInt(req.query.category, 10);
      // 先查出该分类及其子分类的所有 sid
      const { data: catRows } = await supa.select('v_categories', {
        select: 'sid,parent_sid',
        filters: [`or=(sid.eq.${catSid},parent_sid.eq.${catSid})`]
      });
      const sids = [...new Set((catRows || []).map(r => r.sid))];
      if (sids.length > 0) {
        filters.push(`category=in.(${sids.join(',')})`);
      }
    }

    // -- 编码过滤（视图上也支持 bianma） --
    if (req.query.code) {
      filters.push(`bianma=like.%${encodeURIComponent(req.query.code)}%`);
    }

    // -- 条码过滤 --
    if (req.query.barcode) {
      // 先查库存表拿到 bm，再过滤视图
      const { data: stockRows } = await supa.select('xys_stock', {
        select: 'bm',
        filters: [`tm=like.%${encodeURIComponent(req.query.barcode)}%`]
      });
      const bms = [...new Set((stockRows || []).map(r => r.bm).filter(Boolean))];
      if (bms.length > 0) {
        filters.push(`bianma=in.(${bms.join(',')})`);
      } else {
        return res.json({
          code: 0, data: { items: [], total: 0, page, pageSize, totalPages: 0 }
        });
      }
    }

    // ---- 只用 1 次查询！直接从视图取数据 ----
    const { data: items, total } = await supa.select('v_clothing_list', {
      select: '*',
      filters,
      order: 'id.desc',
      limit: pageSize,
      offset
    });

    // 构造 imageUrl
    for (const item of items || []) {
      item.imageUrl = item.pic ? `${r2Base}/${item.pic}` : '';
    }

    res.json({
      code: 0,
      data: {
        items: items || [],
        total: total || 0,
        page,
        pageSize,
        totalPages: Math.ceil((total || 0) / pageSize)
      }
    });
  } catch (err) {
    console.error('查询服装失败:', err);
    res.status(500).json({ code: 1, message: '查询失败', error: err.message });
  }
});

/**
 * GET /api/clothing/:id — 详情
 */
app.get('/api/clothing/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = await supa.selectOne('v_clothing_list', 'id', id);

    if (!item) {
      return res.status(404).json({ code: 1, message: '服装不存在' });
    }

    item.imageUrl = item.pic
      ? `${config.r2.baseUrl}/${item.pic}`
      : '';

    // 分类名和颜色名已经由视图提供了
    // 如果视图没有提供，用缓存查
    if (!item.category_name) item.category_name = await supa.getCategoryName(item.category);
    if (!item.color_name) item.color_name = await supa.getColorName(item.color);

    // 库存明细（从视图取或单独查）
    let stockItems;
    try {
      // 尝试从视图取（如果视图包含库存数据）
      if (item.stock_items) {
        stockItems = item.stock_items;
      } else {
        throw 'skip';
      }
    } catch (e) {
      // 视图没有库存明细，单独查
      const res2 = await supa.select('xys_stock', {
        select: '*',
        filters: [`bm=eq.${item.bianma}`],
        order: 'size,partsid'
      });
      stockItems = res2.data || [];
    }

    item.stockList = [];
    for (const s of stockItems || []) {
      item.stockList.push({
        ...s,
        size_name: await supa.getSizeName(s.size),
        parts_name: await supa.getPartsName(s.partsid)
      });
    }

    // 重写 intro 图片路径 → 指向 R2
    if (item.intro) {
      const r2Base = config.r2.baseUrl;
      item.intro = item.intro
        .replace(/src=["']ueditor\/php\/upload1\//g, `src="${r2Base}/ueditor/php/upload1/`)
        .replace(/src=["']ueditor\/php\/upload\//g, `src="${r2Base}/ueditor/php/upload/`);
    }

    res.json({ code: 0, data: item });
  } catch (err) {
    console.error('查询服装详情失败:', err);
    res.status(500).json({ code: 1, message: '查询失败', error: err.message });
  }
});

/**
 * GET /api/sizes
 */
app.get('/api/sizes', async (req, res) => {
  try {
    const { data } = await supa.select('xys_size', { select: '*', order: 'id' });
    res.json({ code: 0, data });
  } catch (err) {
    res.status(500).json({ code: 1, message: '获取尺寸失败' });
  }
});

/**
 * GET /api/colors
 */
app.get('/api/colors', async (req, res) => {
  try {
    const { data } = await supa.select('xys_color', { select: '*', order: 'id' });
    res.json({ code: 0, data });
  } catch (err) {
    res.status(500).json({ code: 1, message: '获取颜色失败' });
  }
});

// ---- SPA 兜底 ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ============================================================
//   启动时预加载缓存
// ============================================================
if (require.main === module) {
  // 预加载小表到内存（分类、颜色、尺寸、部件）
  Promise.all([
    supa.getCategoryName('1'),
    supa.getColorName('100'),
    supa.getSizeName('170'),
    supa.getPartsName('1')
  ]).then(() => {
    console.log('[缓存] 小表已预加载到内存');
  }).catch(e => {
    console.log('[缓存] 预加载失败（首次请求时自动加载）:', e.message);
  });

  app.listen(config.port, () => {
    console.log(`服装目录系统已启动: http://localhost:${config.port}`);
    console.log(`API 地址: http://localhost:${config.port}/api/clothing`);
  });
}

module.exports = app;
