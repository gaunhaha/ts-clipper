import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent hover:bg-accent-hover text-white shadow-sm',
  secondary: 'bg-bg-subtle hover:bg-border text-neutral-100 border border-border',
  ghost: 'hover:bg-bg-subtle text-neutral-300',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md',
  md: 'h-9 px-3.5 text-sm rounded-md',
  lg: 'h-11 px-5 text-base rounded-lg font-medium',
  icon: 'h-9 w-9 rounded-md flex items-center justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
