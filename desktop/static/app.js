/* ═══════════════════════════════════════════════
   weibo2wechat Desktop · Frontend App
   ═══════════════════════════════════════════════ */

/* ── Theme System ────────────────────────────── */
const THEME_KEY = 'w2w-theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  // Update toggle buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// Theme button click handlers (delegated)
document.addEventListener('click', e => {
  const btn = e.target.closest('.theme-btn');
  if (btn && btn.dataset.theme) {
    applyTheme(btn.dataset.theme);
  }
});

initTheme();

/* ── Global State ────────────────────────────── */
const state = {
  currentPage: 'dashboard',
  settings: {},
  health: {},
  stats: {},
  runs: [],
  discoveryPosts: [],
  selectedPosts: new Set(),
  galleryImages: [],
  imageScores: {},
  selectedImages: [],
  queue: [],
};

/* ── API Helpers ─────────────────────────────── */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PUT = (p, b) => api('PUT', p, b);
const DEL = (p, b) => api('DELETE', p, b);

/* ── Toast ───────────────────────────────────── */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(50px)';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

/* ── Loading ─────────────────────────────────── */
function showLoading(text = '处理中...') {
  document.getElementById('loading').innerHTML = `
    <div class="loading-overlay">
      <div class="loading-box">
        <div class="spinner"></div>
        <div>${text}</div>
      </div>
    </div>`;
  document.getElementById('loading').style.display = 'block';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

/* ── Progress Ring ─────────────────────────────── */
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

function showProgress(total, text = '准备下载...') {
  const el = document.getElementById('loading');
  el.innerHTML = `
    <div class="progress-overlay">
      <div class="progress-box">
        <svg class="progress-ring" width="120" height="120">
          <circle class="progress-ring-bg" cx="60" cy="60" r="52" />
          <circle class="progress-ring-fill" cx="60" cy="60" r="52"
                  stroke-dasharray="${RING_CIRCUMFERENCE}"
                  stroke-dashoffset="${RING_CIRCUMFERENCE}" />
        </svg>
        <div class="progress-text">0/${total}</div>
        <div class="progress-detail">${text}</div>
      </div>
    </div>`;
  el.style.display = 'block';
}

function updateProgress(current, total, detail) {
  const offset = RING_CIRCUMFERENCE - (current / total) * RING_CIRCUMFERENCE;
  const fill = document.querySelector('.progress-ring-fill');
  if (fill) fill.setAttribute('stroke-dashoffset', offset);
  const text = document.querySelector('.progress-text');
  if (text) text.textContent = `${current}/${total}`;
  const det = document.querySelector('.progress-detail');
  if (det && detail) det.textContent = detail;
}

function hideProgress() {
  document.getElementById('loading').style.display = 'none';
}

/* ── Navigation ──────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  renderPage(page);
}

async function renderPage(page) {
  const content = document.getElementById('content');
  try {
    switch (page) {
      case 'dashboard': await renderDashboard(content); break;
      case 'discovery': renderDiscovery(content); break;
      case 'queue': await renderQueue(content); break;
      case 'materials': await renderMaterials(content); break;
      case 'settings': await renderSettings(content); break;
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>${err.message}</p></div>`;
  }
}

/* ── Utils ───────────────────────────────────── */
function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relPath(absPath) {
  const idx = absPath.indexOf('data/images/');
  if (idx >= 0) return absPath.slice(idx + 'data/images/'.length);
  return absPath.split('/').pop();
}

function imgSrc(pathOrUrl) {
  // 本地文件走 /images/，远程 URL 走 /proxy
  if (pathOrUrl.startsWith('http')) return `/proxy?url=${encodeURIComponent(pathOrUrl)}`;
  return `/images/${relPath(pathOrUrl)}`;
}

/* ═══════════════════════════════════════════════
   Dashboard
   ═══════════════════════════════════════════════ */
async function renderDashboard(el) {
  const [health, stats, runs] = await Promise.all([
    GET('/api/dashboard/health'),
    GET('/api/dashboard/stats'),
    GET('/api/dashboard/runs'),
  ]);
  state.health = health;
  state.stats = stats;
  state.runs = runs;

  const healthItems = [
    { name: '微博 Cookie', ok: health.weibo_cookie },
    { name: '微博 UID/明星', ok: health.weibo_uid_or_celebrities },
    { name: 'AI API Key', ok: health.ai_api_key },
    { name: 'AI Base URL', ok: health.ai_base_url },
  ];

  el.innerHTML = `
    <div class="page-header">
      <h2>仪表盘</h2>
      <p>系统状态概览</p>
    </div>

    <div class="grid-4">
      ${healthItems.map(h => `
        <div class="metric-card">
          <div class="value"><span class="status-dot ${h.ok ? 'ok' : 'fail'}"></span></div>
          <div class="label">${h.name}</div>
        </div>
      `).join('')}
    </div>

    <div class="grid-3" style="margin-top:16px">
      <div class="metric-card clickable" onclick="navigateTo('materials')">
        <div class="value">${stats.local_images}</div>
        <div class="label">本地图片</div>
      </div>
      <div class="metric-card">
        <div class="value">${stats.queue_size}</div>
        <div class="label">待发布</div>
      </div>
      <div class="metric-card">
        <div class="value">${stats.selected_count}</div>
        <div class="label">已选图片</div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">快速操作</div>
      <div class="quick-actions">
        <div class="quick-action" onclick="navigateTo('discovery')">
          <div class="icon">🔍</div>
          <div class="title">搜图</div>
          <div class="desc">从微博搜索明星美图</div>
        </div>
        <div class="quick-action" onclick="navigateTo('queue')">
          <div class="icon">📝</div>
          <div class="title">发布</div>
          <div class="desc">查看发布队列</div>
        </div>
        <div class="quick-action" onclick="navigateTo('settings')">
          <div class="icon">⚙️</div>
          <div class="title">设置</div>
          <div class="desc">配置大模型和微博</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">最近运行</div>
      ${runs.length === 0
        ? '<div class="empty-state"><p>暂无运行记录</p></div>'
        : runs.map(r => `
          <div class="run-item">
            <span class="run-id">${r.run_id}</span>
            <span>处理 ${r.processed} 篇${r.failed ? `，失败 ${r.failed}` : ''}</span>
            <span class="run-status" style="color:${r.status === 'completed' ? 'var(--success)' : 'var(--warning)'}">
              ${r.status === 'completed' ? '完成' : '进行中'}
            </span>
          </div>
        `).join('')}
    </div>`;
}

/* ═══════════════════════════════════════════════
   Image Discovery
   ═══════════════════════════════════════════════ */
function renderDiscovery(el) {
  const posts = state.discoveryPosts;
  const scores = state.imageScores;
  const selected = state.selectedImages;

  // 判断是否已下载
  const hasLocal = posts.some(p => p.local_images && p.local_images.length > 0);

  // 收集所有本地图片
  const allLocalImages = [];
  posts.forEach(p => {
    (p.local_images || []).forEach(img => {
      const s = scores[img] || { score: 0, reason: '未评分', method: 'unknown' };
      allLocalImages.push({ path: img, scoreInfo: s, celebrity: p.celebrity, scene: p.scene });
    });
  });
  allLocalImages.sort((a, b) => b.scoreInfo.score - a.scoreInfo.score);
  state.galleryImages = allLocalImages;

  el.innerHTML = `
    <div class="page-header">
      <h2>图片发现</h2>
      <p>从微博搜寻明星美图，AI 智能评分筛选</p>
    </div>

    <!-- 搜索参数 -->
    <div class="card">
      <div class="card-title">搜索参数</div>
      <div class="grid-3">
        <label>抓取模式
          <select id="d-mode">
            <option value="celebrities">明星列表</option>
            <option value="own">本人时间线</option>
            <option value="mixed">混合模式</option>
          </select>
        </label>
        <label>抓取页数
          <input type="number" id="d-pages" value="2" min="1" max="5">
        </label>
        <label>处理帖子数
          <input type="number" id="d-limit" value="5" min="1" max="20">
        </label>
      </div>
      <label>明星列表（逗号分隔）
        <input type="text" id="d-celebs" value="周也,张婧仪,鞠婧祎,赵丽颖,孔雪儿">
      </label>
      <label>搜索标签（逗号分隔）
        <input type="text" id="d-tags" value="美图,日常,时装周,美妆,穿搭">
      </label>
      <div class="search-actions">
        <button class="btn btn-primary" onclick="doSearch()">开始搜索</button>
        <button class="btn" onclick="doDownloadSelected()" ${posts.length ? '' : 'disabled'}>下载选中</button>
        <button class="btn" onclick="doDownload()" ${posts.length ? '' : 'disabled'}>全部下载</button>
        <button class="btn" onclick="doScore()" ${hasLocal ? '' : 'disabled'}>AI 评分</button>
        <button class="btn" onclick="clearDiscovery()">清除结果</button>
      </div>
    </div>

    <!-- 帖子列表 + 图片预览 -->
    ${posts.length ? `
      <div class="card">
        <div class="card-title">
          搜索结果（${posts.length} 条帖子，${posts.reduce((s, p) => s + (p.images || []).length, 0)} 张图片）
          <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
            ${hasLocal ? `<span style="font-size:12px;color:var(--success)">✓ 已下载 ${allLocalImages.length} 张</span>` : ''}
            <button class="btn btn-sm" onclick="toggleSelectAllPosts()">全选/取消</button>
          </span>
        </div>
        ${posts.map((p, pi) => {
          const imgs = p.local_images || [];
          const remoteImgs = p.images || [];
          const displayImgs = imgs.length ? imgs : remoteImgs;
          const isChecked = state.selectedPosts.has(pi);
          return `
            <div class="post-item ${isChecked ? 'post-selected' : ''}" data-post-idx="${pi}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <label class="post-check-label" onclick="event.stopPropagation()">
                  <input type="checkbox" class="post-check" ${isChecked ? 'checked' : ''}
                         onchange="togglePostSelect(${pi}, this.checked)">
                </label>
                <span style="font-weight:600;color:var(--accent)">${p.celebrity}</span>
                <span style="background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500">${p.scene}</span>
                <span style="color:var(--text-muted);font-size:12px">${remoteImgs.length} 张图${imgs.length ? ` · 已下载 ${imgs.length} 张` : ''}</span>
                <button class="btn btn-sm btn-danger" style="margin-left:auto" onclick="removePost(${pi})">删除</button>
              </div>
              ${p.text ? `<div style="color:var(--text-secondary);font-size:13px;margin-bottom:10px">${p.text.slice(0, 100)}</div>` : ''}
              <div class="post-thumbs-wrap" data-post-pi="${pi}">
                <div class="post-thumbs">
                  ${displayImgs.map((img, ii) => {
                    const src = imgSrc(img);
                    return `<img src="${src}" class="post-thumb"
                                 onclick="event.stopPropagation();openPostLightbox(${pi},${ii})"
                                 onerror="this.style.display='none'" loading="lazy">`;
                  }).join('')}
                </div>
                ${displayImgs.length > 8 ? `<div class="post-thumbs-toggle" onclick="event.stopPropagation();togglePostThumbs(this)">
                  展开全部 ${displayImgs.length} 张
                </div>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    ` : ''}

    <!-- 本地图片画廊（下载后显示） -->
    ${allLocalImages.length ? `
      <div class="card">
        <div class="card-title">
          图片画廊
          <span class="sel-count-wrap" style="margin-left:auto;font-size:12px;color:var(--text-secondary)">
            已选 <span class="sel-count">${selected.length}</span> 张
          </span>
          <button class="btn btn-primary btn-sm enqueue-btn" onclick="enqueueSelected()" style="${selected.length ? '' : 'display:none'}">加入发布队列</button>
        </div>
        <div class="gallery">
          ${allLocalImages.map((item, i) => {
            const s = item.scoreInfo;
            const scoreClass = s.score >= 70 ? 'score-high' : s.score >= 40 ? 'score-mid' : 'score-low';
            const isSel = selected.includes(item.path);
            const methodIcon = s.method === 'vision' ? '🤖' : (s.method === 'heuristic' ? '📊' : '');
            const safePath = item.path.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
              <div class="gallery-item ${isSel ? 'selected' : ''}">
                <img src="${imgSrc(item.path)}" loading="lazy"
                     style="cursor:pointer" onclick="event.stopPropagation();openGalleryLightbox(${i})">
                <div class="info">
                  <div>
                    <span class="score ${scoreClass}">${methodIcon} ${s.score}</span>
                    <div class="reason">${s.reason}</div>
                  </div>
                  <input type="checkbox" class="check" ${isSel ? 'checked' : ''}
                         onclick="event.stopPropagation();toggleSelect('${safePath}', this)">
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    ` : posts.length && !hasLocal
      ? '<div class="card"><div class="empty-state"><p>点击「下载图片」将远程图片保存到本地</p></div></div>'
      : ''
    }
  `;
}

async function doSearch() {
  const mode = document.getElementById('d-mode').value;
  const celebs = document.getElementById('d-celebs').value.split(',').map(s => s.trim()).filter(Boolean);
  const tags = document.getElementById('d-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  const pages = parseInt(document.getElementById('d-pages').value) || 2;
  const limit = parseInt(document.getElementById('d-limit').value) || 5;

  showLoading('正在搜索微博...');
  try {
    const res = await POST('/api/discovery/search', {
      mode, celebrities: celebs, search_tags: tags, max_pages: pages, post_limit: limit,
    });
    state.discoveryPosts = res.posts;
    state.selectedPosts.clear();
    state.imageScores = {};
    state.selectedImages = [];
    toast(`找到 ${res.total_posts} 条帖子，${res.total_images} 张图片`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  hideLoading();
  renderDiscovery(document.getElementById('content'));
}

async function doDownload() {
  await doDownloadWithProgress('');
}

async function doDownloadSelected() {
  const indices = [...state.selectedPosts];
  if (!indices.length) {
    toast('请先勾选要下载的帖子', 'error');
    return;
  }
  await doDownloadWithProgress(indices.join(','));
  state.selectedPosts.clear();
}

async function doDownloadWithProgress(indicesStr) {
  const posts = state.discoveryPosts;
  const idxArr = indicesStr ? indicesStr.split(',').map(Number) : posts.map((_, i) => i);
  const totalImages = idxArr.reduce((s, i) => s + (posts[i]?.images?.length || 0), 0);

  if (!totalImages) {
    toast('没有可下载的图片', 'error');
    return;
  }

  showProgress(totalImages, '开始下载...');

  try {
    const url = `/api/discovery/download-stream?indices=${encodeURIComponent(indicesStr)}`;
    const res = await fetch(url);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'start') {
            updateProgress(0, evt.total, '准备下载...');
          } else if (evt.type === 'progress') {
            const detail = `${evt.celebrity} · ${evt.scene}`;
            updateProgress(evt.current, evt.total, detail);
          } else if (evt.type === 'done') {
            // 重新获取最新帖子数据
            const discoveryRes = await GET('/api/discovery');
            if (discoveryRes?.posts) {
              state.discoveryPosts = discoveryRes.posts;
            }
            toast(`下载完成！${evt.downloaded} 张成功${evt.dropped ? `，${evt.dropped} 张跳过` : ''}`, 'success');
          }
        } catch (_) { /* ignore parse errors */ }
      }
    }
  } catch (err) {
    toast(err.message, 'error');
  }

  hideProgress();
  renderDiscovery(document.getElementById('content'));
}

function togglePostSelect(idx, checked) {
  if (checked) {
    state.selectedPosts.add(idx);
  } else {
    state.selectedPosts.delete(idx);
  }
  // 更新帖子卡片样式
  const item = document.querySelector(`.post-item[data-post-idx="${idx}"]`);
  if (item) item.classList.toggle('post-selected', checked);
}

function toggleSelectAllPosts() {
  const posts = state.discoveryPosts;
  const allSelected = posts.length > 0 && state.selectedPosts.size === posts.length;
  state.selectedPosts.clear();
  if (!allSelected) {
    posts.forEach((_, i) => state.selectedPosts.add(i));
  }
  // 更新所有复选框
  document.querySelectorAll('.post-check').forEach((cb) => {
    cb.checked = !allSelected;
    const item = cb.closest('.post-item');
    if (item) item.classList.toggle('post-selected', !allSelected);
  });
}

async function removePost(index) {
  try {
    await DEL(`/api/discovery/post/${index}`);
    // 重建 selectedPosts（索引会偏移）
    const newSelected = new Set();
    state.selectedPosts.forEach(i => {
      if (i < index) newSelected.add(i);
      else if (i > index) newSelected.add(i - 1);
    });
    state.selectedPosts = newSelected;
    state.discoveryPosts.splice(index, 1);
    renderDiscovery(document.getElementById('content'));
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function doScore() {
  showLoading('AI 正在评分...');
  try {
    const res = await POST('/api/discovery/score', { use_vision: true });
    state.imageScores = res.scores;
    toast(`评分完成！Vision: ${res.vision_count}，启发式: ${res.heuristic_count}`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  hideLoading();
  renderDiscovery(document.getElementById('content'));
}

function openPostLightbox(postIdx, imgIdx) {
  const p = state.discoveryPosts[postIdx];
  if (!p) return;
  const imgs = p.local_images || p.images || [];
  const srcs = imgs.map(img => imgSrc(img));
  openLightbox(srcs, imgIdx);
}

function togglePostThumbs(el) {
  const wrap = el.closest('.post-thumbs-wrap');
  if (!wrap) return;
  wrap.classList.toggle('expanded');
  el.textContent = wrap.classList.contains('expanded')
    ? '收起' : `展开全部 ${wrap.querySelectorAll('.post-thumb').length} 张`;
}

function clearDiscovery() {
  state.discoveryPosts = [];
  state.selectedPosts.clear();
  state.imageScores = {};
  state.selectedImages = [];
  renderDiscovery(document.getElementById('content'));
}

/* ═══════════════════════════════════════════════
   Local Materials
   ═══════════════════════════════════════════════ */
let materialsData = { groups: [], total_images: 0 };
let matFilter = '';
let matSelected = new Set();

async function renderMaterials(el) {
  const data = await GET('/api/materials');
  materialsData = data;

  const filteredGroups = matFilter
    ? data.groups.filter(g => g.celebrity.includes(matFilter))
    : data.groups;

  el.innerHTML = `
    <div class="page-header">
      <h2>本地素材</h2>
      <p>管理已下载的图片素材</p>
    </div>

    <div class="card">
      <div class="materials-header">
        <div class="materials-search">
          <input type="text" placeholder="搜索明星..." value="${escHtml(matFilter)}"
                 oninput="matFilter=this.value;renderMaterials(document.getElementById('content'))">
        </div>
        <div class="materials-stats">
          <span>共 ${data.total_images} 张图片</span>
          <span>${data.groups.length} 位明星</span>
          <span>已选 <strong>${matSelected.size}</strong> 张</span>
        </div>
      </div>
      <div class="mat-actions">
        <button class="btn btn-sm" onclick="matSelectAll()">全选当前</button>
        <button class="btn btn-sm" onclick="matClearSelection()" ${matSelected.size ? '' : 'disabled'}>取消选择</button>
        <button class="btn btn-sm" onclick="matEnqueueSelected()" ${matSelected.size ? '' : 'disabled'}>加入发布队列</button>
        <button class="btn btn-sm btn-danger" onclick="matDeleteSelected()" ${matSelected.size ? '' : 'disabled'}>删除所选</button>
      </div>
    </div>

    ${filteredGroups.length === 0 ? `
      <div class="empty-state">
        <div class="icon">🖼️</div>
        <p>${matFilter ? '没有匹配的素材' : '暂无本地素材，请先在「图片发现」页面下载图片'}</p>
      </div>
    ` : filteredGroups.map(group => `
      <div class="card mat-group" data-celeb="${escHtml(group.celebrity)}">
        <div class="mat-group-header" onclick="toggleMatGroup(this)">
          <span class="mat-arrow">▼</span>
          <span class="mat-celeb-name">${escHtml(group.celebrity)}</span>
          <span class="mat-count">${group.total} 张图片 · ${group.scenes.length} 个场景</span>
        </div>
        <div class="mat-scenes">
          ${group.scenes.map(scene => `
            <div class="mat-scene-label">${escHtml(scene.scene)} · ${scene.total} 张</div>
            <div class="gallery">
              ${scene.posts.flatMap(post =>
                post.images.map(img => {
                  const safePath = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                  const isSel = matSelected.has(img);
                  const fileName = img.split('/').pop();
                  return `
                    <div class="gallery-item ${isSel ? 'selected' : ''}">
                      <img src="${imgSrc(img)}" loading="lazy"
                           style="cursor:pointer" onclick="openMatLightbox('${safePath}')">
                      <div class="info">
                        <div class="reason" title="${escHtml(fileName)}">${escHtml(fileName.slice(0, 18))}</div>
                        <input type="checkbox" class="check" ${isSel ? 'checked' : ''}
                               onclick="event.stopPropagation();matToggle('${safePath}', this)">
                      </div>
                    </div>`;
                })
              ).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function toggleMatGroup(headerEl) {
  const group = headerEl.closest('.mat-group');
  if (group) group.classList.toggle('collapsed');
}

function matToggle(path, el) {
  const card = el ? el.closest('.gallery-item') : null;
  if (matSelected.has(path)) {
    matSelected.delete(path);
    if (card) card.classList.remove('selected');
    if (el) el.checked = false;
  } else {
    matSelected.add(path);
    if (card) card.classList.add('selected');
    if (el) el.checked = true;
  }
  matUpdateUI();
}

function matSelectAll() {
  materialsData.groups.forEach(g => {
    g.scenes.forEach(s => {
      s.posts.forEach(p => {
        p.images.forEach(img => matSelected.add(img));
      });
    });
  });
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.add('selected');
    const cb = item.querySelector('.check');
    if (cb) cb.checked = true;
  });
  matUpdateUI();
}

function matClearSelection() {
  matSelected.clear();
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.remove('selected');
    const cb = item.querySelector('.check');
    if (cb) cb.checked = false;
  });
  matUpdateUI();
}

function matUpdateUI() {
  const counter = document.querySelector('.materials-stats span:nth-child(3)');
  if (counter) counter.innerHTML = `已选 <strong>${matSelected.size}</strong> 张`;
  document.querySelectorAll('.mat-actions .btn').forEach(btn => {
    if (btn.textContent.includes('取消') || btn.textContent.includes('加入') || btn.textContent.includes('删除')) {
      btn.disabled = matSelected.size === 0;
    }
  });
}

async function matDeleteSelected() {
  const paths = [...matSelected];
  if (!paths.length) return;
  if (!confirm(`确认删除 ${paths.length} 张图片？此操作不可恢复。`)) return;
  try {
    await DEL('/api/materials', { paths });
    matSelected.clear();
    toast(`已删除 ${paths.length} 张图片`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  renderMaterials(document.getElementById('content'));
}

async function matEnqueueSelected() {
  const paths = [...matSelected];
  if (!paths.length) return;
  try {
    const res = await POST('/api/queue', {
      title: '', desc: '',
      images: paths,
      cover: paths[0],
    });
    matSelected.clear();
    toast(`已加入队列，共 ${paths.length} 张图片`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  renderMaterials(document.getElementById('content'));
}

function openMatLightbox(path) {
  // 收集当前可见的所有图片
  const allImages = [];
  let targetIdx = 0;
  materialsData.groups.forEach(g => {
    g.scenes.forEach(s => {
      s.posts.forEach(p => {
        p.images.forEach(img => {
          if (img === path) targetIdx = allImages.length;
          allImages.push(img);
        });
      });
    });
  });
  openLightbox(allImages.map(img => imgSrc(img)), targetIdx);
}

async function toggleSelect(path, el) {
  const i = state.selectedImages.indexOf(path);
  const card = el ? el.closest('.gallery-item') : null;
  const cb = card ? card.querySelector('.check') : null;

  if (i >= 0) {
    state.selectedImages.splice(i, 1);
    if (card) card.classList.remove('selected');
    if (cb) cb.checked = false;
    POST('/api/selection/remove', { path });
  } else {
    state.selectedImages.push(path);
    if (card) card.classList.add('selected');
    if (cb) cb.checked = true;
    POST('/api/selection/add', { path });
  }

  // 更新已选计数
  const counter = document.querySelector('.sel-count');
  if (counter) counter.textContent = state.selectedImages.length;
  // 更新按钮可见性
  const enqBtn = document.querySelector('.enqueue-btn');
  if (enqBtn) enqBtn.style.display = state.selectedImages.length ? '' : 'none';
}

async function enqueueSelected() {
  try {
    const res = await POST('/api/queue/enqueue-selected');
    state.selectedImages = [];
    toast(`已加入队列：《${res.title}》`, 'success');
    renderDiscovery(document.getElementById('content'));
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════
   Publish Queue
   ═══════════════════════════════════════════════ */
async function renderQueue(el) {
  const data = await GET('/api/queue');
  state.queue = data.queue;

  el.innerHTML = `
    <div class="page-header">
      <h2>发布队列</h2>
      <p>预览和发布图文内容到公众号</p>
    </div>

    ${state.queue.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📭</div>
        <p>发布队列为空，请先在「图片发现」页面选图并加入队列</p>
      </div>
    ` : state.queue.map((item, i) => `
      <div class="card">
        <div class="queue-card">
          <div class="preview">
            ${item.cover ? `<img src="${imgSrc(item.cover)}" onerror="this.style.display='none'">` : ''}
            <div class="thumbs">
              ${(item.images || []).map((img, ii) => `
                <img src="${imgSrc(img)}"
                     onclick="openQueueLightbox(${i}, ${ii})"
                     onerror="this.style.display='none'">
              `).join('')}
            </div>
          </div>
          <div class="editor">
            <label>标题
              <input type="text" value="${escHtml(item.title)}"
                     onchange="updateQueueItem(${i},'title',this.value)" maxlength="64">
            </label>
            <label>文案
              <textarea onchange="updateQueueItem(${i},'desc',this.value)">${escHtml(item.desc)}</textarea>
            </label>
            <label>封面
              <select onchange="updateQueueItem(${i},'cover',this.value)">
                ${(item.images || []).map(img => `
                  <option value="${img}" ${img === item.cover ? 'selected' : ''}>${img.split('/').pop()}</option>
                `).join('')}
              </select>
            </label>
            <div class="actions">
              <button class="btn btn-primary" onclick="publishItem(${i}, {save_draft:true})">保存草稿</button>
              <button class="btn" onclick="publishItem(${i}, {save_draft:false})">直接发布</button>
              <button class="btn" onclick="publishItem(${i}, {dry_run:true})">预览</button>
              <button class="btn" onclick="generateContent(${i})">AI 生成</button>
              <button class="btn btn-danger" onclick="deleteQueueItem(${i})">删除</button>
            </div>
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

function openQueueLightbox(queueIdx, imgIdx) {
  const item = state.queue[queueIdx];
  if (!item) return;
  const srcs = (item.images || []).map(img => imgSrc(img));
  openLightbox(srcs, imgIdx);
}

async function updateQueueItem(index, field, value) {
  await PUT(`/api/queue/${index}`, { [field]: value });
}

async function deleteQueueItem(index) {
  await DEL(`/api/queue/${index}`);
  toast('已删除', 'info');
  renderQueue(document.getElementById('content'));
}

async function generateContent(index) {
  showLoading('AI 正在生成标题和文案...');
  try {
    const res = await POST(`/api/queue/${index}/generate`);
    toast(`已生成：《${res.title}》`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
  hideLoading();
  renderQueue(document.getElementById('content'));
}

async function publishItem(index, opts = {}) {
  const dryRun = opts.dry_run || false;
  const saveDraft = opts.save_draft !== undefined ? opts.save_draft : true;
  let action = '保存草稿';
  if (dryRun) action = '预览';
  else if (!saveDraft) action = '发布';
  showLoading(`正在${action}...`);
  try {
    const res = await POST(`/api/queue/${index}/publish`, { dry_run: dryRun, save_draft: saveDraft });
    if (res.success) {
      toast(`${action}成功：${res.message}`, 'success');
    } else {
      toast(`${action}失败：${res.message}`, 'error');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
  hideLoading();
  renderQueue(document.getElementById('content'));
}

/* ── Lightbox ──────────────────────────────────── */
let lightbox = { images: [], index: 0, originals: [] };

function openLightbox(images, index, originals) {
  lightbox.images = images;
  lightbox.originals = originals || images;
  lightbox.index = index;
  renderLightbox();
  document.addEventListener('keydown', lightboxKeyHandler);
}

function closeLightbox() {
  const el = document.getElementById('lightbox');
  if (el) el.remove();
  document.removeEventListener('keydown', lightboxKeyHandler);
}

function lightboxKeyHandler(e) {
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  else if (e.key === 'ArrowRight') lightboxNav(1);
  else if (e.key === 'Escape') closeLightbox();
}

function lightboxNav(delta) {
  const total = lightbox.images.length;
  if (!total) return;
  lightbox.index = (lightbox.index + delta + total) % total;
  renderLightbox();
}

function renderLightbox() {
  const { images, index, originals } = lightbox;
  const url = images[index];
  const origUrl = originals[index] || url;
  let el = document.getElementById('lightbox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lightbox';
    document.body.appendChild(el);
  }
  el.className = 'lightbox';
  el.innerHTML = `
    <div class="lb-backdrop" onclick="closeLightbox()"></div>
    <div class="lb-content">
      <button class="lb-close" onclick="closeLightbox()">&times;</button>
      <button class="lb-nav lb-prev" onclick="event.stopPropagation();lightboxNav(-1)">&#8249;</button>
      <div class="lb-img-wrap" onclick="event.stopPropagation()">
        <img src="${url}">
      </div>
      <button class="lb-nav lb-next" onclick="event.stopPropagation();lightboxNav(1)">&#8250;</button>
      <div class="lb-bar">
        <span class="lb-counter">${index + 1} / ${images.length}</span>
        <a class="btn btn-sm btn-primary lb-download" href="${origUrl}" target="_blank" download>原图下载</a>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════
   Settings
   ═══════════════════════════════════════════════ */
async function renderSettings(el) {
  const settings = await GET('/api/settings');
  state.settings = settings;

  el.innerHTML = `
    <div class="page-header">
      <h2>系统设置</h2>
      <p>修改后点击保存，配置将写入 .env 文件并立即生效</p>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="switchTab(this,'tab-llm')">大模型</button>
      <button class="tab" onclick="switchTab(this,'tab-weibo')">微博</button>
      <button class="tab" onclick="switchTab(this,'tab-run')">运行参数</button>
      <button class="tab" onclick="switchTab(this,'tab-watermark')">水印过滤</button>
    </div>

    <!-- LLM -->
    <div id="tab-llm" class="tab-content active">
      <div class="card">
        <div class="grid-2">
          <label>AI Provider
            <select id="s-provider">
              ${['mimo', 'openai', 'deepseek', 'glm'].map(p =>
                `<option value="${p}" ${p === settings.ai_provider ? 'selected' : ''}>${p}</option>`
              ).join('')}
            </select>
          </label>
          <label>Model
            <input type="text" id="s-model" value="${escHtml(settings.ai_model)}">
          </label>
          <label>Base URL
            <input type="text" id="s-baseurl" value="${escHtml(settings.ai_base_url)}" placeholder="https://api.example.com/v1">
          </label>
          <label>API Key
            <input type="password" id="s-apikey" value=""
                   placeholder="${settings.ai_api_key_set ? '已设置（留空保持不变）' : '请输入 API Key'}">
          </label>
        </div>
        <button class="btn btn-primary" onclick="saveLLM()" style="margin-top:16px">保存模型配置</button>
      </div>
    </div>

    <!-- Weibo -->
    <div id="tab-weibo" class="tab-content">
      <div class="card">
        <div class="grid-2">
          <label style="grid-column:1/-1">微博 Cookie
            <textarea id="s-cookie" rows="3">${escHtml(settings.weibo_cookie_set ? '已设置（留空保持不变）' : '')}</textarea>
          </label>
          <label>微博 UID
            <input type="text" id="s-uid" value="${escHtml(settings.weibo_uid)}" placeholder="留空自动推断">
          </label>
          <label>抓取模式
            <select id="s-fetchmode">
              ${['own', 'celebrities', 'mixed'].map(m =>
                `<option value="${m}" ${m === settings.weibo_fetch_mode ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
          </label>
          <label>明星列表（逗号分隔）
            <input type="text" id="s-celebs" value="${escHtml(settings.weibo_celebrities)}">
          </label>
          <label>搜索标签（逗号分隔）
            <input type="text" id="s-tags" value="${escHtml(settings.weibo_search_tags)}">
          </label>
          <label>场景补充标签
            <input type="text" id="s-scenetags" value="${escHtml(settings.weibo_scene_extra_tags)}">
          </label>
        </div>
        <button class="btn btn-primary" onclick="saveWeibo()" style="margin-top:16px">保存微博配置</button>
      </div>
    </div>

    <!-- Run Params -->
    <div id="tab-run" class="tab-content">
      <div class="card">
        <div class="grid-3">
          <label>每次处理条数
            <input type="number" id="s-postlimit" value="${settings.post_limit}" min="1" max="3">
          </label>
          <label>微博抓取页数
            <input type="number" id="s-weibopages" value="${settings.weibo_pages}" min="1" max="10">
          </label>
          <label>发布间隔（秒）
            <input type="number" id="s-interval" value="${settings.publish_interval}" min="5" max="60">
          </label>
          <label>请求超时（秒）
            <input type="number" id="s-timeout" value="${settings.request_timeout}" min="5" max="60">
          </label>
          <label>重试次数
            <input type="number" id="s-retry" value="${settings.retry_times}" min="1" max="5">
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="s-confirm" ${settings.require_confirm ? 'checked' : ''}> 发布前需确认
          </label>
        </div>
        <button class="btn btn-primary" onclick="saveRun()" style="margin-top:16px">保存运行参数</button>
      </div>
    </div>

    <!-- Watermark -->
    <div id="tab-watermark" class="tab-content">
      <div class="card">
        <div class="grid-2">
          <label class="checkbox-label">
            <input type="checkbox" id="s-wmfilter" ${settings.watermark_filter ? 'checked' : ''}> 启用水印过滤
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="s-wmstrict" ${settings.watermark_strict_mode ? 'checked' : ''}> 严格模式
          </label>
          <label>最少无水印图片数
            <input type="number" id="s-minclean" value="${settings.min_clean_images}" min="1" max="10">
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="s-wmfallback" ${settings.allow_watermark_fallback ? 'checked' : ''}> 严格模式下允许降级
          </label>
          <label>角标检测阈值
            <input type="range" id="s-corner" min="1.0" max="2.0" step="0.02" value="${settings.watermark_corner_ratio}">
            <span id="s-corner-val">${settings.watermark_corner_ratio}</span>
          </label>
          <label>底边检测阈值
            <input type="range" id="s-bottom" min="1.0" max="2.0" step="0.02" value="${settings.watermark_bottom_ratio}">
            <span id="s-bottom-val">${settings.watermark_bottom_ratio}</span>
          </label>
        </div>
        <button class="btn btn-primary" onclick="saveWatermark()" style="margin-top:16px">保存水印配置</button>
      </div>
    </div>
  `;

  document.getElementById('s-corner').oninput = function () {
    document.getElementById('s-corner-val').textContent = this.value;
  };
  document.getElementById('s-bottom').oninput = function () {
    document.getElementById('s-bottom-val').textContent = this.value;
  };
}

function switchTab(btn, tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

async function saveLLM() {
  const provider = document.getElementById('s-provider').value;
  const model = document.getElementById('s-model').value.trim();
  const baseUrl = document.getElementById('s-baseurl').value.trim();
  const apiKey = document.getElementById('s-apikey').value.trim();

  const updates = { AI_PROVIDER: provider, AI_MODEL: model, AI_BASE_URL: baseUrl };
  if (apiKey) {
    const keyMap = { mimo: 'MIMO_API_KEY', openai: 'OPENAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', glm: 'GLM_API_KEY' };
    updates[keyMap[provider] || 'AI_API_KEY'] = apiKey;
  }
  try {
    await POST('/api/settings', updates);
    toast('模型配置已保存', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveWeibo() {
  const updates = {
    WEIBO_UID: document.getElementById('s-uid').value.trim(),
    WEIBO_FETCH_MODE: document.getElementById('s-fetchmode').value,
    WEIBO_CELEBRITIES: document.getElementById('s-celebs').value.trim(),
    WEIBO_SEARCH_TAGS: document.getElementById('s-tags').value.trim(),
    WEIBO_SCENE_EXTRA_TAGS: document.getElementById('s-scenetags').value.trim(),
  };
  const cookie = document.getElementById('s-cookie').value.trim();
  if (cookie && cookie !== '已设置（留空保持不变）') {
    updates.WEIBO_COOKIE = cookie;
  }
  try {
    await POST('/api/settings', updates);
    toast('微博配置已保存', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveRun() {
  const updates = {
    POST_LIMIT: document.getElementById('s-postlimit').value,
    WEIBO_PAGES: document.getElementById('s-weibopages').value,
    PUBLISH_INTERVAL_SECONDS: document.getElementById('s-interval').value,
    REQUEST_TIMEOUT: document.getElementById('s-timeout').value,
    RETRY_TIMES: document.getElementById('s-retry').value,
    REQUIRE_CONFIRM: document.getElementById('s-confirm').checked ? 'true' : 'false',
  };
  try {
    await POST('/api/settings', updates);
    toast('运行参数已保存', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveWatermark() {
  const updates = {
    WATERMARK_FILTER: document.getElementById('s-wmfilter').checked ? 'true' : 'false',
    WATERMARK_STRICT_MODE: document.getElementById('s-wmstrict').checked ? 'true' : 'false',
    MIN_CLEAN_IMAGES: document.getElementById('s-minclean').value,
    ALLOW_WATERMARK_FALLBACK: document.getElementById('s-wmfallback').checked ? 'true' : 'false',
    WATERMARK_CORNER_RATIO: document.getElementById('s-corner').value,
    WATERMARK_BOTTOM_RATIO: document.getElementById('s-bottom').value,
  };
  try {
    await POST('/api/settings', updates);
    toast('水印配置已保存', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ── Init ────────────────────────────────────── */
renderPage('dashboard');
