import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#289ED8] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-gradient-to-r from-[#2B3990] to-[#289ED8] text-white hover:brightness-105 shadow-sm',
        teal:        'bg-[#36D7AE] text-[#132A42] hover:bg-[#28BF99]',
        secondary:   'bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]',
        ghost:       'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline:     'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB]',
        link:        'text-[#289ED8] underline-offset-4 hover:text-[#2B3990] hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
