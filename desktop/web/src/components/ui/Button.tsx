import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import Loading from './Loading';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  type?: 'default' | 'primary' | 'text' | 'link';
  size?: 'sm' | 'md' | 'lg';
  danger?: boolean;
  ghost?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  htmlType?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  block?: boolean;
}

const sizeClasses = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      type = 'default',
      size = 'md',
      danger = false,
      ghost = false,
      loading = false,
      icon,
      htmlType = 'button',
      block = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) => {
    const cls = [
      'btn',
      sizeClasses[size],
      type === 'primary' && 'btn-primary',
      type === 'text' && 'btn-text',
      type === 'link' && 'btn-link',
      danger && 'btn-danger',
      ghost && 'btn-ghost',
      block ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={htmlType}
        className={cls}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? <Loading size="xs" /> : icon}
        {children && <span>{children}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
export default Button;
