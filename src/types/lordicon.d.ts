import { DetailedHTMLProps, HTMLAttributes } from 'react'

type LordIconElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src: string
  trigger?: 'hover' | 'click' | 'loop' | 'loop-on-hover' | 'morph' | 'boomerang' | 'none'
  colors?: string
  delay?: number
  stroke?: number
  state?: string
  target?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lord-icon': LordIconElement
    }
  }
}
