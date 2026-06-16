import type { SettingsData } from '../../api/client';
import WeiboSection from './WeiboSection';
import ToutiaoSection from './ToutiaoSection';

export default function MediaSourceSection({
  data,
  save,
  onReload,
}: {
  data: SettingsData;
  save: (u: Record<string, string>) => void;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <WeiboSection data={data} save={save} onReload={onReload} />
      <ToutiaoSection data={data} save={save} onReload={onReload} />
    </div>
  );
}
