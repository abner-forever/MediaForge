import { useState } from 'react';
import Select from '../../components/Select';
import NumberInput from '../../components/NumberInput';
import type { PlatformMeta } from '../../api/client';

function SectionToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-0.5 rounded hover:bg-bg-secondary text-text-muted hover:text-text transition-colors shrink-0">
      <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

export default function SearchParams({
  platform, mode, limit, minImages, celebs, tags, superTopics, toutiaoKeywords,
  filterWatermark, searching, platforms, activePlatform, modeOptions,
  onPlatformChange, onSearch, onDownloadSelected, onDownloadAll, onScore, onClear,
  setMode, setLimit, setMinImages, setCelebs, setTags, setSuperTopics, setToutiaoKeywords,
  setFilterWatermark,
  selectedPosts, downloading, scoring, hasLocalAny, filteredIndices,
  recommending, recommendedCelebs, onAiRecommend, onSearchCeleb,
}: {
  platform: string; mode: string; limit: number; minImages: number;
  celebs: string; tags: string; superTopics: string; toutiaoKeywords: string;
  filterWatermark: boolean; searching: boolean;
  platforms: Record<string, PlatformMeta>; activePlatform: PlatformMeta | undefined;
  modeOptions: { label: string; value: string }[];
  onPlatformChange: (p: string) => void; onSearch: () => void;
  onDownloadSelected: () => void; onDownloadAll: () => void;
  onScore: () => void; onClear: () => void;
  setMode: (v: string) => void; setLimit: (v: number) => void; setMinImages: (v: number) => void;
  setCelebs: (v: string) => void; setTags: (v: string) => void;
  setSuperTopics: (v: string) => void; setToutiaoKeywords: (v: string) => void;
  setFilterWatermark: (v: boolean) => void;
  selectedPosts: Set<number>; downloading: boolean; scoring: boolean;
  hasLocalAny: boolean; filteredIndices: number[];
  recommending: boolean; recommendedCelebs: string[];
  onAiRecommend: () => void;
  onSearchCeleb: (name: string) => void;
}) {
  const [showTarget, setShowTarget] = useState(true);
  const [showAi, setShowAi] = useState(false);

  const showCelebInput = platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed');
  const showSuperTopicInput = platform === 'weibo' && mode === 'super_topic';
  const showTagInput = platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed' || mode === 'keyword');
  const showToutiaoInput = platform === 'toutiao' && mode === 'keyword';
  const showXhsInput = platform === 'xhs' && mode === 'keyword';

  return (
    <div className="card space-y-4">
      <div className="section-header">搜索参数</div>

      {/* ── 数据源 ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
          <span className="text-sm font-semibold text-text">数据源</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text mb-1">内容平台</label>
            <Select value={platform} onChange={onPlatformChange} options={Object.values(platforms).map(p => ({ label: p.name, value: p.id }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">抓取模式</label>
            <Select value={mode} onChange={setMode} options={modeOptions} />
          </div>
        </div>
      </div>

      {/* ── 搜索目标 ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <svg className={`w-4 h-4 transition-colors ${showTarget ? 'text-accent' : 'text-text-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <span className="text-sm font-semibold text-text">搜索目标</span>
          <SectionToggle open={showTarget} onClick={() => setShowTarget(v => !v)} />
        </div>
        {showTarget && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text mb-1">处理条数</label>
                <NumberInput value={limit} onChange={setLimit} min={1} max={20} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">最少图片</label>
                <NumberInput value={minImages} onChange={setMinImages} min={0} max={20} />
              </div>
            </div>
            {showCelebInput && (
              <div>
                <label className="block text-sm font-medium text-text mb-1">明星列表</label>
                <input type="text" className="input w-full" value={celebs} onChange={e => setCelebs(e.target.value)} placeholder="迪丽热巴,杨幂（逗号分隔）" />
                <p className="text-xs text-text-muted mt-1">将与每个搜索标签组合，例如「迪丽热巴 写真」</p>
              </div>
            )}
            {showSuperTopicInput && (
              <div>
                <label className="block text-sm font-medium text-text mb-1">超话列表</label>
                <input type="text" className="input w-full" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="迪丽热巴超话,杨幂超话（逗号分隔）" />
              </div>
            )}
            {showTagInput && (
              <div>
                <label className="block text-sm font-medium text-text mb-1">搜索标签</label>
                <input type="text" className="input w-full" value={tags} onChange={e => setTags(e.target.value)} placeholder="写真,街拍,活动（逗号分隔）" />
                <p className="text-xs text-text-muted mt-1">与明星名组合搜索</p>
              </div>
            )}
            {showToutiaoInput && (
              <div>
                <label className="block text-sm font-medium text-text mb-1">搜索关键词</label>
                <input type="text" className="input w-full" value={toutiaoKeywords} onChange={e => setToutiaoKeywords(e.target.value)} placeholder="时尚,明星,穿搭（逗号分隔）" />
              </div>
            )}
            {showXhsInput && (
              <div>
                <label className="block text-sm font-medium text-text mb-1">搜索关键词</label>
                <input type="text" className="input w-full" value={tags} onChange={e => setTags(e.target.value)} placeholder="穿搭,美妆,明星（逗号分隔）" />
              </div>
            )}
            <div className="flex justify-start pt-0.5">
              <label className="toggle">
                <input type="checkbox" checked={filterWatermark} onChange={e => setFilterWatermark(e.target.checked)} />
                <span className="toggle-track" />
                <span className="toggle-label text-sm">下载时过滤疑似水印图片</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ── AI 推荐 ── */}
      {(mode === 'celebrities' || mode === 'mixed' || mode === 'super_topic' || mode === 'keyword') && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className={`w-4 h-4 ${showAi ? 'text-accent' : 'text-text-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              <line x1="12" y1="2" x2="12" y2="17.77" /><line x1="2" y1="9.27" x2="22" y2="9.27" />
            </svg>
            <span className="text-sm font-semibold text-text">AI 推荐</span>
            <SectionToggle open={showAi} onClick={() => setShowAi(v => !v)} />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-sm btn-ghost" onClick={onAiRecommend} disabled={recommending}>
              {recommending ? (
                <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin inline-block" /> 推荐中…</>
              ) : (
                `✨ ${recommendedCelebs.length ? '刷新推荐' : 'AI 推荐当前热门女星'}`
              )}
            </button>
          </div>
          {showAi && recommendedCelebs.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {recommendedCelebs.map((name) => (
                <button
                  key={name}
                  className="px-3 py-1 text-sm rounded-full border border-border bg-bg-secondary hover:bg-accent hover:text-white hover:border-accent transition-colors cursor-pointer"
                  onClick={() => onSearchCeleb(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 操作按钮 ── */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={onSearch} disabled={searching}>
            {searching ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 搜索中</> : '开始搜索'}
          </button>
          <button className="btn" onClick={onDownloadSelected} disabled={!selectedPosts.size || downloading}>
            {downloading ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 下载中</> : <>下载选中{selectedPosts.size > 0 ? ` (${selectedPosts.size})` : ''}</>}
          </button>
          <button className="btn" onClick={onDownloadAll} disabled={!filteredIndices.length || downloading}>
            {downloading ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 下载中</> : '全部下载'}
          </button>
          <button className="btn" onClick={onScore} disabled={!hasLocalAny || scoring}>
            {scoring ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 评分中</> : 'AI 评分'}
          </button>
          <button className="btn btn-ghost" onClick={onClear}>清除</button>
        </div>
      </div>
    </div>
  );
}
