import Select from '../../components/Select';
import NumberInput from '../../components/NumberInput';
import type { PlatformMeta } from '../../api/client';

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
  return (
    <div className="card space-y-4">
      <div className="section-header">搜索参数</div>
      <div className="grid grid-cols-2 gap-4">
        <label>内容平台
          <Select value={platform} onChange={onPlatformChange} options={Object.values(platforms).map(p => ({ label: p.name, value: p.id }))} />
        </label>
        <label>抓取模式
          <Select value={mode} onChange={setMode} options={modeOptions} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label>处理条数<NumberInput value={limit} onChange={setLimit} min={1} max={20} /></label>
        <label>最少图片<NumberInput value={minImages} onChange={setMinImages} min={0} max={20} /></label>
      </div>
      {platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed') && (
        <div>
          <label>明星列表
            <input type="text" value={celebs} onChange={e => setCelebs(e.target.value)} placeholder="迪丽热巴,杨幂（逗号分隔）" /></label>
          <span className="text-xs text-text-muted">将与每个搜索标签组合，例如「迪丽热巴 写真」</span>
        </div>
      )}
      {platform === 'weibo' && mode === 'super_topic' && (
        <label>超话列表<input type="text" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="迪丽热巴超话,杨幂超话（逗号分隔）" /></label>
      )}
      {platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed') && (
        <div>
          <label>搜索标签
            <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="写真,街拍,活动（逗号分隔）" /></label>
          <span className="text-xs text-text-muted">与明星名组合搜索</span>
        </div>
      )}
      {platform === 'weibo' && mode === 'keyword' && (
        <div>
          <label>搜索标签
            <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="写真,街拍,活动（逗号分隔）" /></label>
          <span className="text-xs text-text-muted">仅按标签搜索，不涉及明星名称</span>
        </div>
      )}
      {platform === 'toutiao' && mode === 'keyword' && (
        <label>搜索关键词<input type="text" value={toutiaoKeywords} onChange={e => setToutiaoKeywords(e.target.value)} placeholder="时尚,明星,穿搭（逗号分隔）" /></label>
      )}
      {platform === 'xhs' && mode === 'keyword' && (
        <label>搜索关键词<input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="穿搭,美妆,明星（逗号分隔）" /></label>
      )}
      <div className="flex justify-start">
        <label className="toggle">
          <input type="checkbox" checked={filterWatermark} onChange={e => setFilterWatermark(e.target.checked)} />
          <span className="toggle-track" />
          <span className="toggle-label">下载时过滤疑似水印图片</span>
        </label>
      </div>

      {/* AI 推荐热门女星 — 仅适用于按明星/超话/关键词搜索的模式 */}
      {(mode === 'celebrities' || mode === 'mixed' || mode === 'super_topic' || mode === 'keyword') && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button className="btn btn-ghost text-sm" onClick={onAiRecommend} disabled={recommending}>
              {recommending ? (
                <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin inline-block" /> 推荐中…</>
              ) : (
                `✨ ${recommendedCelebs.length ? '刷新推荐' : 'AI 推荐当前热门女星'}`
              )}
            </button>
          </div>
          {recommendedCelebs.length > 0 && (
            <div className="flex flex-wrap gap-2">
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
  );
}
