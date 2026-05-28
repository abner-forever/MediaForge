import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Checkbox from '../ui/Checkbox';
import { checkSensitiveWords, checkClickbaitRisk } from '../../utils/compliance';
import { complianceApi } from '../../api/client';
import type { WeChatAccount, DuplicateCheckResult } from '../../api/client';

interface PublishConfirmModalProps {
  open: boolean;
  action: 'draft' | 'publish';
  account?: WeChatAccount | null;
  title: string;
  content?: string;
  cover?: string;
  images?: string[];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function imgSrc(p: string) {
  if (!p) return '';
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
  if (!p.startsWith('/')) return `/images/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
}

function riskText(path: string) {
  const name = path.toLowerCase();
  return name.includes('watermark') || name.includes('logo') || name.includes('微博') || name.includes('weibo');
}

export default function PublishConfirmModal({
  open,
  action,
  account,
  title,
  content = '',
  cover = '',
  images = [],
  loading = false,
  onConfirm,
  onCancel,
}: PublishConfirmModalProps) {
  const [ackHighRisk, setAckHighRisk] = useState(false);
  const [risks, setRisks] = useState<{ level: 'high' | 'medium' | 'low'; text: string }[]>([]);
  const [dupCheck, setDupCheck] = useState<DuplicateCheckResult | null>(null);

  useEffect(() => {
    const items: { level: 'high' | 'medium' | 'low'; text: string }[] = [];
    if (!account) items.push({ level: 'high', text: '未选择公众号账号，请先选择发布账号。' });
    else if (!account.logged_in) items.push({ level: 'high', text: '当前公众号账号未登录，请先到设置页扫码。' });
    if (!title.trim()) items.push({ level: 'high', text: '标题为空，发布前需要补充标题。' });
    if (title.trim().length > 64) items.push({ level: 'medium', text: '标题较长，建议压缩到 64 字以内。' });
    if (!content.trim()) items.push({ level: 'medium', text: '正文为空，保存草稿可以继续，但直接发布风险较高。' });
    if (!cover) items.push({ level: 'medium', text: '未选择封面，建议补充封面后再发布。' });
    if (images.length === 0) items.push({ level: action === 'publish' ? 'high' : 'medium', text: '未附带图片，请确认这是否符合本次内容。' });
    else if (images.length < 3) items.push({ level: 'low', text: '图片数量低于建议值，图集内容建议至少 3 张。' });
    if (images.some(riskText) || (cover && riskText(cover))) items.push({ level: 'medium', text: '存在疑似水印或来源标识图片，请人工确认。' });

    // 标题 emoji 检测（微信公众平台不支持标题 emoji）
    if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}]/u.test(title)) {
      items.push({ level: 'medium', text: '标题包含 emoji 表情，微信公众号可能不支持显示，建议去除。' });
    }

    // 合规检查：敏感词 & 标题党
    const compliance = { title, content };
    const sensitive = checkSensitiveWords(compliance.title + ' ' + compliance.content);
    const clickbait = checkClickbaitRisk(compliance.title);
    for (const sw of sensitive) {
      items.push({ level: 'high', text: `标题或正文含敏感词"${sw.word}"，请修改后重新检查。` });
    }
    for (const cb of clickbait) {
      items.push({ level: cb.level, text: cb.reason });
    }

    setRisks(items);
  }, [account, action, content, cover, images, title]);

  // 异步检测：标题重复
  useEffect(() => {
    if (!title.trim()) { setDupCheck(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await complianceApi.duplicate(title);
        setDupCheck(res);
      } catch { setDupCheck(null); }
    }, 400);
    return () => clearTimeout(timer);
  }, [title]);

  // 将重复检测合并到 risks
  const allRisks = dupCheck?.duplicate
    ? [...risks, { level: 'medium' as const, text: `标题"${title}"与已有内容相似，建议修改以避免重复发布。` }]
    : risks;

  const highRisk = allRisks.some(r => r.level === 'high');
  const canSubmit = !loading && (!highRisk || ackHighRisk);
  const previewImages = images.slice(0, 8);

  return (
    <Modal open={open} onClose={onCancel} className="w-[760px] max-w-[calc(100vw-32px)] max-h-[88vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold text-text mb-1">发布前确认</h3>
          <p className="text-sm text-text-secondary">{action === 'draft' ? '保存到公众号草稿前，请确认关键信息。' : '直接发布前，请再次确认账号、内容和风险。'}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${action === 'publish' ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent'}`}>
          {action === 'publish' ? '直接发布' : '保存草稿'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-secondary p-3">
            <div className="text-xs text-text-muted mb-1">公众号账号</div>
            <div className="text-sm font-semibold text-text">{account?.name || '未选择账号'}</div>
            <div className={`text-xs mt-1 ${account?.logged_in ? 'text-success' : 'text-danger'}`}>{account?.logged_in ? '已登录' : '未登录'}</div>
          </div>
          {cover ? (
            <button className="block w-full rounded-lg overflow-hidden border border-border bg-bg-secondary" onClick={(e) => e.preventDefault()}>
              <img src={imgSrc(cover)} alt="" className="w-full aspect-[4/3] object-cover" />
            </button>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-text-muted text-center">未选择封面</div>
          )}
          <div className="text-xs text-text-muted">图片数量：{images.length}</div>
          {previewImages.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {previewImages.map((img, i) => <img key={`${img}-${i}`} src={imgSrc(img)} alt="" className="aspect-square object-cover rounded-md border border-border" />)}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-xs text-text-muted mb-1">标题</div>
            <div className="text-base font-semibold text-text leading-snug break-words">{title || '无标题'}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">正文预览</div>
            <div className="rounded-lg border border-border bg-bg-secondary p-3 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
              {content.trim() || '暂无正文'}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-2">风险提示</div>
            {allRisks.length === 0 ? (
              <div className="rounded-lg bg-success/10 text-success border border-success/20 px-3 py-2 text-sm">未发现明显风险，仍建议人工确认内容无误。</div>
            ) : (
              <div className="space-y-2">
                {allRisks.map((risk, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${
                    risk.level === 'high' ? 'bg-danger/10 text-danger border-danger/20'
                      : risk.level === 'medium' ? 'bg-warning/10 text-warning border-warning/20'
                        : 'bg-bg-secondary text-text-secondary border-border'
                  }`}>
                    {risk.text}
                  </div>
                ))}
              </div>
            )}
          </div>
          {highRisk && (
            <Checkbox checked={ackHighRisk} onChange={setAckHighRisk}>我已确认以上高风险项，仍要继续</Checkbox>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-border-subtle">
        <button className="btn" onClick={onCancel} disabled={loading}>返回编辑</button>
        <button className={`btn ${action === 'publish' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={!canSubmit}>
          {loading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 处理中</> : action === 'publish' ? '确认发布' : '确认保存草稿'}
        </button>
      </div>
    </Modal>
  );
}
