import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import ModalComponent from './ui/Modal';
import Dialog from './ui/Dialog';
import PublishConfirmModal from './feature/PublishConfirmModal';
import type { WeChatAccount } from '../api/client';

/* ─── Modal 函数式 API（类似 antd Modal） ─── */

interface AlertOptions {
  title?: string;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  checkboxLabel?: string;
  defaultChecked?: boolean;
}

interface InfoOptions {
  title?: string;
  message: string;
  duration?: number;
}

interface OpenOptions {
  title?: string;
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
}

interface OpenRef {
  close: () => void;
  update: (options: Partial<OpenOptions>) => void;
}

interface ConfirmReturn {
  confirmed: boolean;
  checked: boolean;
}

interface PublishConfirmOptions {
  action: 'draft' | 'publish';
  account?: WeChatAccount | null;
  title: string;
  content?: string;
  cover?: string;
  images?: string[];
}

interface PublishConfirmReturn {
  confirmed: boolean;
  headless: boolean;
}

type RenderFn = (root: Root, el: HTMLElement, close: () => void) => void;

function mount(render: RenderFn) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);

  function close() {
    root.unmount();
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  render(root, el, close);
}

function ModalApi() {} // 作为命名空间

/** 成功提示弹窗，点击"知道了"关闭 */
ModalApi.alert = function alert(options: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    mount((root, el, close) => {
      const done = () => {
        close();
        resolve();
      };
      root.render(
        <ModalComponent open onClose={done} className="min-w-[280px] max-w-[360px]">
          <div className="flex flex-col items-center py-1">
            <div className="w-11 h-11 rounded-full bg-accent-softer flex items-center justify-center mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #10b981)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold text-text mb-1.5">{options.title || '提示'}</h3>
            <p className="text-[13px] text-text-secondary text-center leading-relaxed">{options.message}</p>
            <button className="btn btn-primary mt-5 min-w-[100px]" onClick={done}>知道了</button>
          </div>
        </ModalComponent>
      );
    });
  });
};

/** 确认弹窗，支持可选的 checkbox，返回 { confirmed, checked } */
ModalApi.confirm = function confirm(options: ConfirmOptions): Promise<ConfirmReturn> {
  return new Promise((resolve) => {
    mount((root, el, close) => {
      let done = false;
      const cleanup = (confirmed: boolean, checked: boolean) => {
        if (done) return;
        done = true;
        close();
        resolve({ confirmed, checked });
      };

      root.render(
        <Dialog
          open
          title={options.title}
          message={options.message}
          confirmText={options.confirmText}
          cancelText={options.cancelText}
          danger={options.danger}
          checkboxLabel={options.checkboxLabel}
          defaultChecked={options.defaultChecked}
          noLoading
          onConfirm={(checked) => cleanup(true, checked)}
          onCancel={() => cleanup(false, false)}
        />
      );
    });
  });
};

/** 信息弹窗，自动关闭 */
ModalApi.info = function info(options: InfoOptions): void {
  mount((root, el, close) => {
    const duration = options.duration ?? 2000;
    setTimeout(close, duration);
    root.render(
      <ModalComponent open onClose={close} className="min-w-[280px] max-w-[360px]">
        <div className="flex flex-col items-center py-1">
          <div className="w-11 h-11 rounded-full bg-accent-softer flex items-center justify-center mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #10b981)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </div>
          <h3 className="text-[15px] font-semibold text-text mb-1.5">{options.title || '提示'}</h3>
          <p className="text-[13px] text-text-secondary text-center leading-relaxed">{options.message}</p>
        </div>
      </ModalComponent>
    );
  });
};

/** 发布前确认弹窗 */
ModalApi.publishConfirm = function publishConfirm(options: PublishConfirmOptions): Promise<PublishConfirmReturn> {
  return new Promise((resolve) => {
    mount((root, el, close) => {
      let done = false;
      const cleanup = (confirmed: boolean, headless: boolean) => {
        if (done) return;
        done = true;
        close();
        resolve({ confirmed, headless });
      };

      root.render(
        <PublishConfirmModal
          open
          action={options.action}
          account={options.account || null}
          title={options.title}
          content={options.content}
          cover={options.cover}
          images={options.images}
          loading={false}
          onConfirm={(headless) => cleanup(true, headless)}
          onCancel={() => cleanup(false, false)}
        />
      );
    });
  });
};

/** 自定义内容弹窗 */
ModalApi.open = function open(options: OpenOptions): OpenRef {
  let currentOptions = { ...options };
  let currentRoot: Root | null = null;
  let currentEl: HTMLElement | null = null;

  function render() {
    if (!currentRoot || !currentEl) return;
    currentRoot.render(
      <ModalComponent
        open
        onClose={() => {
          if (currentRoot && currentEl) {
            currentRoot.unmount();
            if (currentEl.parentNode) currentEl.parentNode.removeChild(currentEl);
          }
        }}
        className={currentOptions.className}
      >
        {currentOptions.title && (
          <h3 className="text-base font-bold text-text mb-3">{currentOptions.title}</h3>
        )}
        <div className="text-sm text-text-secondary">{currentOptions.content}</div>
        {currentOptions.footer && (
          <div className="flex justify-end gap-2.5 mt-4 pt-3 border-t border-border-subtle">
            {currentOptions.footer}
          </div>
        )}
      </ModalComponent>
    );
  }

  const el = document.createElement('div');
  document.body.appendChild(el);
  currentEl = el;
  currentRoot = createRoot(el);
  render();

  return {
    close: () => {
      if (currentRoot && currentEl) {
        currentRoot.unmount();
        if (currentEl.parentNode) currentEl.parentNode.removeChild(currentEl);
        currentRoot = null;
        currentEl = null;
      }
    },
    update: (opts: Partial<OpenOptions>) => {
      currentOptions = { ...currentOptions, ...opts };
      render();
    },
  };
};

export { ModalApi as Modal };
