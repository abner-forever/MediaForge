import { useState } from 'react';
import type { SettingsData } from '../../api/client';
import Select from '../../components/Select';
import { useLoading } from '../../hooks/useLoading';

export default function ToutiaoSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [cookie, setCookie] = useState('');
  const [userId, setUserId] = useState(data.toutiao_user_id);
  const [fetchMode, setFetchMode] = useState(data.toutiao_fetch_mode);
  const [searchTags, setSearchTags] = useState(data.toutiao_search_tags);

  return (
    <div className="card space-y-4">
      <div className="section-header">今日头条配置</div>
      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2">头条 Cookie<textarea value={cookie} onChange={e => setCookie(e.target.value)} placeholder={data.toutiao_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} /></label>
        <label>用户ID<input type="text" value={userId} onChange={e => setUserId(e.target.value)} /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '推荐流', value: 'feed' }, { label: '用户主页', value: 'user' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label className="col-span-2">搜索关键词<input type="text" value={searchTags} onChange={e => setSearchTags(e.target.value)} placeholder="时尚,明星,穿搭（逗号分隔）" /></label>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { TOUTIAO_USER_ID: userId, TOUTIAO_FETCH_MODE: fetchMode, TOUTIAO_SEARCH_TAGS: searchTags }; if (cookie) u.TOUTIAO_COOKIE = cookie; await save(u); })} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存头条配置'}
      </button>
    </div>
  );
}
