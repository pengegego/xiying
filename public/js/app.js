/**
 * 服装目录系统 - 前端逻辑
 * 功能: 分类树 | 搜索 | 商品网格 | 分页 | 详情弹窗
 */

// ============================================================
//   状态
// ============================================================
const state = {
  currentCategory: '',
  searchCode: '',
  searchBarcode: '',
  page: 1,
  pageSize: 20,
  totalPages: 0,
  total: 0,
  currentItems: []  // 当前页商品列表，用于上下翻页
};

// DOM
const $ = id => document.getElementById(id);
const grid = $('clothingGrid');
const loading = $('loading');
const emptyState = $('emptyState');
const pagination = $('pagination');
const categoryTree = $('categoryTree');
const currentCategoryLabel = $('currentCategory');
const resultCount = $('resultCount');

// ============================================================
//   分类树
// ============================================================
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    
    const json = await res.json();
    console.log('分类加载成功:', json);
    if (json.code !== 0) throw new Error(json.message);

    const categories = json.data;

    let html = '<li class="cat-all active" data-id="">\n  <span class="cat-dot"></span>\n  全部服装\n</li>';

    for (const cat of categories) {
      const hasChildren = cat.children && cat.children.length > 0;
      html += `<li class="cat-parent${hasChildren ? ' open' : ''}" data-id="${cat.id}">`;
      html += `<div class="cat-label" data-id="${cat.id}"><span>${esc(cat.name)}</span>`;
      if (hasChildren) html += `<span class="cat-toggle">▶</span>`;
      html += `</div>`;
      if (hasChildren) {
        html += `<ul class="cat-children">`;
        for (const child of cat.children) {
          html += `<li class="cat-child" data-id="${child.id}">${esc(child.name)}</li>`;
        }
        html += `</ul>`;
      }
      html += `</li>`;
    }

    categoryTree.innerHTML = html;
    bindCategoryEvents();

    // 也填充手机端的下拉框
    const mobileSelect = document.getElementById('mobileCategory');
    if (mobileSelect) {
      // 保留"全部"选项
      mobileSelect.innerHTML = '<option value="">全部服装</option>';
      for (const cat of categories) {
        // 父分类
        mobileSelect.innerHTML += `<option value="${cat.id}">├ ${esc(cat.name)}</option>`;
        if (cat.children) {
          for (const child of cat.children) {
            mobileSelect.innerHTML += `<option value="${child.id}">&nbsp;&nbsp;├ ${esc(child.name)}</option>`;
          }
        }
      }
      mobileSelect.addEventListener('change', () => {
        state.currentCategory = mobileSelect.value;
        state.page = 1;
        // 同步侧边栏高亮
        document.querySelectorAll('.cat-all, .cat-label, .cat-child').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.cat-parent').forEach(el => el.classList.remove('active-root'));
        if (!mobileSelect.value) {
          document.querySelector('.cat-all')?.classList.add('active');
        }
        loadClothing();
      });
    }
  } catch (err) {
    console.error('加载分类失败:', err);
  }
}

function bindCategoryEvents() {
  const allItem = document.querySelector('.cat-all');
  if (allItem) {
    allItem.addEventListener('click', () => {
      document.querySelectorAll('.cat-all, .cat-label, .cat-child').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.cat-parent').forEach(el => el.classList.remove('active-root'));
      allItem.classList.add('active');
      state.currentCategory = '';
      state.page = 1;
      loadClothing();
    });
  }

  document.querySelectorAll('.cat-label').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const parentLi = el.closest('.cat-parent');
      parentLi.classList.toggle('open');
      document.querySelectorAll('.cat-all, .cat-label, .cat-child').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.cat-parent').forEach(el => el.classList.remove('active-root'));
      el.classList.add('active');
      parentLi.classList.add('active-root');
      state.currentCategory = parentLi.dataset.id;
      state.page = 1;
      loadClothing();
    });
  });

  document.querySelectorAll('.cat-child').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.cat-all, .cat-label, .cat-child').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.cat-parent').forEach(el => el.classList.remove('active-root'));
      el.classList.add('active');
      const parentLi = el.closest('.cat-parent');
      if (parentLi) {
        parentLi.querySelector('.cat-label').classList.add('active');
        parentLi.classList.add('active-root');
        parentLi.classList.add('open');
      }
      state.currentCategory = el.dataset.id;
      state.page = 1;
      loadClothing();
    });
  });
}

// ============================================================
//   商品列表
// ============================================================
async function loadClothing() {
  grid.style.display = 'none';
  emptyState.style.display = 'none';
  pagination.style.display = 'none';
  loading.style.display = 'block';

  try {
    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('pageSize', state.pageSize);
    if (state.currentCategory) params.set('category', state.currentCategory);
    if (state.searchCode) params.set('code', state.searchCode);
    if (state.searchBarcode) params.set('barcode', state.searchBarcode);

    const res = await fetch(`/api/clothing?${params.toString()}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message);

    const { items, total, page, totalPages } = json.data;
    state.total = total;
    state.totalPages = totalPages;
    state.currentItems = items;

    updateFilterInfo();
    loading.style.display = 'none';

    if (items.length === 0) {
      grid.innerHTML = '';
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      pagination.style.display = 'none';
      return;
    }

    grid.innerHTML = items.map(item => buildCard(item)).join('');
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    renderPagination();
    pagination.style.display = 'flex';

    document.querySelectorAll('.clothing-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (id) showDetail(id);
      });
    });

  } catch (err) {
    console.error('加载商品失败:', err);
    loading.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.querySelector('.empty-title').textContent = '加载失败';
    emptyState.querySelector('.empty-desc').textContent = '请检查网络后刷新重试';
  }
}

function buildCard(item) {
  const imgHtml = item.imageUrl
    ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'img-placeholder\\'>📷</div>'" />`
    : `<div class="img-placeholder">📷</div>`;

  const discount = parseFloat(item.zhekou);
  const hasDiscount = discount > 0 && discount < 10;

  const badgeHtml = hasDiscount
    ? `<span class="card-badge">-${Math.round((1 - discount / 10) * 100)}%</span>`
    : '';


  return `
    <div class="clothing-card" data-id="${item.id}">
      <div class="img-wrap">
        ${badgeHtml}
        ${imgHtml}
      </div>
      <div class="card-body">
        <div class="card-code">${esc(item.bianma || '')}</div>
        <div class="card-name" title="${esc(item.name || '')}">${esc(item.name || '未命名')}</div>
      </div>
    </div>
  `;
}

// ============================================================
//   详情弹窗
// ============================================================
async function showDetail(id) {
  try {
    // 找到当前商品在列表中的位置
    const idx = state.currentItems.findIndex(i => i.id == id);

    const res = await fetch(`/api/clothing/${id}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message);

    const item = json.data;
    const discount = parseFloat(item.zhekou);
    const hasDiscount = discount > 0 && discount < 10;

    const imgHtml = item.imageUrl
      ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" />`
      : `<div style="padding:60px 0;text-align:center;font-size:56px;color:var(--text-muted);">📷</div>`;

    let stockTableHtml = '';
    if (item.stockList && item.stockList.length > 0) {
      stockTableHtml = `
        <div class="detail-stock-title">库存明细</div>
        <table class="stock-table">
          <thead>
            <tr>
              <th>条码</th>
              <th>尺寸</th>
              <th>部件</th>
              <th>库房</th>
              <th class="num">数量</th>
              <th class="num">租价</th>
              <th class="num">售价</th>
            </tr>
          </thead>
          <tbody>
            ${item.stockList.map(s => `
              <tr>
                <td>${esc(s.tm || '—')}</td>
                <td>${esc(s.size_name || '—')}</td>
                <td>${esc(s.parts_name || '—')}</td>
                <td>${esc(s.position_name || esc(s.position) || '—')}</td>
                <td class="num">${s.quantity || 0}</td>
                <td class="num">${s.zuprice ? '¥' + Number(s.zuprice).toFixed(2) : '—'}</td>
                <td class="num">${s.price ? '¥' + Number(s.price).toFixed(2) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const priceHtml = item.price
      ? `<div class="detail-price-box">
           <span class="detail-price">¥${Number(item.price).toFixed(2)}</span>
           ${hasDiscount ? `<span class="detail-discount">${discount} 折</span>` : ''}
         </div>`
      : '';

    // 上下翻页
    const prevId = idx > 0 ? state.currentItems[idx - 1].id : null;
    const nextId = idx < state.currentItems.length - 1 ? state.currentItems[idx + 1].id : null;
    const posHtml = `<span style="font-size:13px;color:var(--text-muted);font-weight:400;">${idx + 1}/${state.currentItems.length}</span>`;

    const navHtml = `
      <div class="detail-nav">
        <button class="btn-nav" data-id="${prevId || ''}" ${!prevId ? 'disabled' : ''}>
          ‹ 上一个
        </button>
        <button class="btn-nav" data-id="${nextId || ''}" ${!nextId ? 'disabled' : ''}>
          下一个 ›
        </button>
      </div>
    `;

    const contentHtml = `
      <div class="detail-layout">
        <div class="detail-image">${imgHtml}</div>
        <div class="detail-info">
          <h2>${esc(item.name || '')}</h2>
          <div class="detail-code">编码: ${esc(item.bianma || '')}</div>
          <div class="detail-meta">
            ${item.category_name ? `<span class="detail-meta-item">${esc(item.category_name)}</span>` : ''}
            ${item.color_name ? `<span class="detail-meta-item">${esc(item.color_name)}</span>` : ''}
          </div>
          ${priceHtml}
          ${item.intro ? `<div class="detail-intro">${item.intro}</div>` : ''}
          ${stockTableHtml}
        </div>
      </div>
      ${navHtml}
    `;

    showModal(item.name || '商品详情', contentHtml, posHtml);

    // 绑定翻页按钮
    document.querySelectorAll('.btn-nav').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.id;
        if (targetId) showDetail(targetId);
      });
    });

  } catch (err) {
    console.error('加载详情失败:', err);
    alert('加载详情失败');
  }
}

// ============================================================
//   Modal
// ============================================================
function showModal(title, contentHtml, posHtml) {
  const old = document.querySelector('.modal-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${esc(title)}</h3>
        <div class="modal-header-right">
          ${posHtml || ''}
          <span class="modal-close">&times;</span>
        </div>
      </div>
      <div class="modal-body">${contentHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-close')) {
      overlay.remove();
    }
  });
}

// ============================================================
//   分页
// ============================================================
function renderPagination() {
  const { page, totalPages, total } = state;
  if (totalPages <= 1) {
    pagination.innerHTML = `<span class="page-info">共 ${total} 件</span>`;
    return;
  }

  let html = '';
  html += `<button class="page-prev" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹</button>`;

  const maxVisible = 7;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  if (start > 1) {
    html += `<button data-page="1">1</button>`;
    if (start > 2) html += `<span class="page-info">...</span>`;
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span class="page-info">...</span>`;
    html += `<button data-page="${totalPages}">${totalPages}</button>`;
  }

  html += `<button class="page-next" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">›</button>`;
  html += `<span class="page-info">共 ${total} 件 · ${totalPages} 页</span>`;

  pagination.innerHTML = html;

  pagination.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages && p !== state.page) {
        state.page = p;
        loadClothing();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// ============================================================
//   筛选信息
// ============================================================
function updateFilterInfo() {
  const parts = [];
  if (state.currentCategory) {
    const activeEl = document.querySelector('.cat-label.active, .cat-child.active, .cat-all.active');
    parts.push(activeEl ? activeEl.textContent.trim() : '分类');
  } else {
    parts.push('全部服装');
  }
  if (state.searchCode) parts.push(`编码: ${state.searchCode}`);
  if (state.searchBarcode) parts.push(`条码: ${state.searchBarcode}`);

  currentCategoryLabel.textContent = parts.join(' · ');
  resultCount.textContent = state.total > 0 ? `共 ${state.total} 件` : '';
}

// ============================================================
//   搜索
// ============================================================
function doSearch() {
  state.searchCode = $('searchCode').value.trim();
  state.searchBarcode = $('searchBarcode').value.trim();
  state.page = 1;
  loadClothing();
}

function resetSearch() {
  $('searchCode').value = '';
  $('searchBarcode').value = '';
  state.searchCode = '';
  state.searchBarcode = '';
  state.page = 1;
  loadClothing();
}

// ============================================================
//   工具
// ============================================================
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// ============================================================
//   启动
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadClothing();

  $('searchBtn').addEventListener('click', doSearch);
  $('resetBtn').addEventListener('click', resetSearch);

  $('searchCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('searchBarcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
});
