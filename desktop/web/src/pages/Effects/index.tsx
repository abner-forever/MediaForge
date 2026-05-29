import { useEffect, useState, useCallback, useRef } from 'react';
import { effectsApi, wechatAccountApi } from '../../api/client';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';
import type { EffectSummary, EffectTrendPoint, EffectCompareData, WeChatAccount, ImageAnalysisItem } from '../../types';
import OverviewCards from './OverviewCards';
import TrendChart from './TrendChart';
import HeatmapChart from './HeatmapChart';
import CelebrityRank from './CelebrityRank';
import CompareChart from './CompareChart';
import FunnelChart from './FunnelChart';
import ImageAnalysis from './ImageAnalysis';
import ArticleDataTabs from './ArticleDataTabs';
import EmptyState from './EmptyState';
import HelpGuide from '../../components/ui/HelpGuide';
import Select from '../../components/Select';

export default function Effects() {
  const { addToast } = useStore();
  const { loading, withLoading } = useLoading();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<EffectSummary | null>(null);
  const [trend, setTrend] = useState<EffectTrendPoint[]>([]);
  const [compare, setCompare] = useState<EffectCompareData | null>(null);
  const [imageItems, setImageItems] = useState<ImageAnalysisItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [accounts, setAccounts] = useState<WeChatAccount[]>([]);
  const [syncAccountId, setSyncAccountId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncPages, setSyncPages] = useState(1);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    await withLoading(async () => {
      const [s, t, c, ia] = await Promise.all([
        effectsApi.summary(),
        effectsApi.trend(days),
        effectsApi.compare(),
        effectsApi.imageAnalysis(),
      ]);
      setSummary(s);
      setTrend(t.trend);
      setCompare(c);
      setImageItems(ia.items);
    });
  }, [days, withLoading]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    wechatAccountApi.list().then(d => {
      setAccounts(d.accounts);
      const def = d.accounts.find(a => a.is_default);
      if (def) setSyncAccountId(def.account_id);
    }).catch(() => {});
  }, []);

  // 日志区域自动滚到底部（滚动容器内部，不影响页面）
  useEffect(() => {
    if (syncLogs.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [syncLogs]);

  const handleSync = async () => {
    if (!syncAccountId) {
      addToast('请先选择公众号账号', 'info');
      return;
    }
    setSyncing(true);
    setLogsExpanded(true);
    setSyncLogs(['正在连接...']);
    try {
      await wechatAccountApi.syncEffects(syncAccountId, (evt) => {
        if (evt.message) setSyncLogs(prev => [...prev, evt.message!]);
        if (evt.type === 'done') {
          addToast(`同步完成：已同步 ${evt.synced ?? 0} 篇文章数据`, 'success');
        } else if (evt.type === 'error') {
          addToast(`同步失败：${evt.message}`, 'error');
        }
      }, syncPages);
      load();
    } catch {
      addToast('同步请求失败', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await effectsApi.exportCsv();
      addToast('导出成功', 'success');
    } catch {
      addToast('导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  const hasData = summary && summary.total_posts > 0;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>效果分析</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>时间范围</span>
            {[7, 14, 30, 0].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '4px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  background: days === d ? 'var(--accent)' : 'var(--border)',
                  color: days === d ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.2s',
                }}
              >
                {d === 0 ? '全部' : `${d}天`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32 }}>
          {accounts.length > 0 && (
            <>
              <div style={{ width: 140 }}>
                <Select
                  value={syncAccountId}
                  onChange={setSyncAccountId}
                  options={[
                    { label: '选择公众号', value: '' },
                    ...accounts.map(a => ({
                      label: `${a.name}${a.logged_in ? '' : ' (未登录)'}`,
                      value: a.account_id,
                    })),
                  ]}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="text-xs text-text-muted whitespace-nowrap">页数</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={syncPages}
                  onChange={e => setSyncPages(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="w-14 text-sm text-center"
                  disabled={syncing}
                  style={{ height: 32 }}
                />
              </div>
              <button
                onClick={handleSync}
                disabled={syncing || !syncAccountId}
                className="btn btn-sm btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', height: 32 }}
              >
                {syncing ? (
                  <>
                    <span style={{
                      width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite', display: 'inline-block',
                    }} />
                    同步中...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    同步公众号数据
                  </>
                )}
              </button>
            </>
          )}
          {hasData && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting ? '导出中…' : '导出 CSV'}
            </button>
          )}
          <HelpGuide title="效果分析 — 使用说明">
            <p><b>1. 数据来源</b>：在「发布队列」或「文章发布」页面对已发布内容录入效果数据（阅读量、点赞等），此处自动汇总展示。也可点击「同步公众号数据」自动从公众号后台抓取。</p>
            <p><b>2. 概览卡片</b>：顶部 4 个指标卡片展示发布总数、总阅读量、平均阅读和平均点赞，一眼掌握整体表现。</p>
            <p><b>3. 趋势图</b>：折线图展示近 7/14/30 天的阅读量和点赞趋势，鼠标悬停查看每日详情。</p>
            <p><b>4. 最佳时段</b>：热力图按「星期 × 小时」展示阅读量分布，深色区域代表高阅读量时段，帮你选择最佳发布时间。</p>
            <p><b>5. 艺人排行</b>：按平均阅读量降序排列各艺人，快速识别最受欢迎的内容方向。</p>
            <p><b>6. 多维对比</b>：按来源平台、内容类型、艺人三个维度对比阅读量，辅助内容策略决策。</p>
            <p><b>7. 导出数据</b>：点击「导出 CSV」下载完整数据表格，可用 Excel 做进一步分析。</p>
          </HelpGuide>
        </div>
      </div>

      {/* Sync Logs */}
      {syncLogs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <button
            className="flex items-center justify-between w-full px-4 py-2.5 border-b border-border text-left"
            onClick={() => setLogsExpanded(v => !v)}
          >
            <span className="text-xs font-medium text-text-secondary">
              同步日志 <span className="text-text-muted">({syncLogs.length})</span>
            </span>
            <div className="flex items-center gap-2">
              <span
                className="text-xs text-text-muted hover:text-text"
                onClick={e => { e.stopPropagation(); setSyncLogs([]); }}
                role="button"
              >
                清除
              </span>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" className="text-text-muted transition-transform"
                style={{ transform: logsExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>
          {/* 固定高度容器，内部滚动不影响页面 */}
          <div
            style={{
              height: logsExpanded ? 160 : 0,
              transition: 'height 0.3s ease-in-out',
              overflow: 'hidden',
            }}
          >
            <div
              ref={logContainerRef}
              className="overflow-y-auto px-4 py-2 space-y-0.5"
              style={{ height: 160 }}
            >
              {syncLogs.map((log, i) => (
                <div key={i} className="text-xs text-text-secondary font-mono leading-relaxed">{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{
            width: 32, height: 32, border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : !hasData ? (
        <EmptyState />
      ) : (
        <>
          <OverviewCards summary={summary} />
          <TrendChart data={trend} days={days} onDaysChange={setDays} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FunnelChart days={days} />
            <HeatmapChart data={trend} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <CelebrityRank days={days} />
            {compare && <CompareChart data={compare} />}
          </div>
          {imageItems.length > 1 && <ImageAnalysis />}
        </>
      )}
      {!loading && <ArticleDataTabs onCleared={load} />}
    </div>
  );
}
