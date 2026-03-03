import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:
          'bg-white/10 hover:bg-white/15 text-white border border-white/5 shadow-sm backdrop-blur-md',
        destructive:
          'bg-state-error/20 text-state-error border border-state-error/20 hover:bg-state-error/30',
        outline:
          'border border-white/10 bg-transparent text-white/80 hover:bg-white/5 hover:text-white',
        secondary: 'bg-white/5 text-white/80 hover:bg-white/10',
        ghost: 'hover:bg-white/5 text-white/70 hover:text-white',
        link: 'text-white/70 underline-offset-4 hover:underline hover:text-white',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
