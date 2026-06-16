/**
 * 绑定设备列表
 * 显示已绑定设备，支持解绑操作
 */

interface DeviceListProps {
  devices: string[];
  onUnbind: (deviceId: string) => void;
}

export default function DeviceList({ devices, onUnbind }: DeviceListProps) {
  return (
    <div className="card p-5">
      <div className="section-header">绑定设备</div>

      {devices.length === 0 ? (
        <p className="text-sm text-text-muted">暂无绑定设备</p>
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map((deviceId, index) => (
            <div
              key={deviceId}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-bg-secondary hover:bg-bg-inset transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="var(--text-muted)"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm text-text">设备 {index + 1}</span>
                <span className="text-xs text-text-muted font-mono">
                  {deviceId.substring(0, 8)}...
                </span>
              </div>
              <button
                onClick={() => onUnbind(deviceId)}
                className="text-danger text-[13px] px-2 py-0.5 hover:bg-danger/10 rounded transition-colors cursor-pointer bg-transparent border-none"
              >
                解绑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
