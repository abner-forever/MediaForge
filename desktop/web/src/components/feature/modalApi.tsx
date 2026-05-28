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
}

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    let done = false;

    function cleanup(value: boolean) {
      if (done) return;
      done = true;
      root.unmount();
      if (el.parentNode) el.parentNode.removeChild(el);
      resolve(value);
    }

    root.render(
      <ConfirmDialog
        open
        title={options.title}
        message={options.message}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        danger={options.danger}
        noLoading
        onConfirm={() => cleanup(true)}
        onCancel={() => cleanup(false)}
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

export function showPublishConfirm(options: PublishConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    let done = false;

    function cleanup(value: boolean) {
      if (done) return;
      done = true;
      root.unmount();
      if (el.parentNode) el.parentNode.removeChild(el);
      resolve(value);
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
        onConfirm={() => cleanup(true)}
        onCancel={() => cleanup(false)}
      />
    );
  });
}
