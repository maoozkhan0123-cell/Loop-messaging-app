import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3589FA] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-[#3589FA] text-white hover:bg-[#2B70E0]',
        teal:        'bg-[#36D7AE] text-[#132A42] hover:bg-[#28BF99]',
        secondary:   'bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]',
        ghost:       'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline:     'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB]',
        link:        'text-[#3589FA] underline-offset-4 hover:underline',
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
