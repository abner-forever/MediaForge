import { createRoot } from 'react-dom/client';
import ConfirmDialog from '../ui/ConfirmDialog';
import PublishConfirmModal from './PublishConfirmModal';
import type { WeChatAccount } from '../../api/client';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  checkboxLabel?: string;
  defaultChecked?: boolean;
}

export function showConfirm(options: ConfirmOptions): Promise<{ confirmed: boolean; checkboxChecked: boolean }> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    let done = false;

    function cleanup(confirmed: boolean, checkboxChecked: boolean) {
      if (done) return;
      done = true;
      root.unmount();
      if (el.parentNode) el.parentNode.removeChild(el);
      resolve({ confirmed, checkboxChecked });
    }

    root.render(
      <ConfirmDialog
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
}

interface PublishConfirmOptions {
  action: 'draft' | 'publish';
  account?: WeChatAccount | null;
  title: string;
  content?: string;
  cover?: string;
  images?: string[];
}

export function showPublishConfirm(options: PublishConfirmOptions): Promise<{ confirmed: boolean; headless: boolean }> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    let done = false;

    function cleanup(confirmed: boolean, headless: boolean) {
      if (done) return;
      done = true;
      root.unmount();
      if (el.parentNode) el.parentNode.removeChild(el);
      resolve({ confirmed, headless });
    }

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
}
