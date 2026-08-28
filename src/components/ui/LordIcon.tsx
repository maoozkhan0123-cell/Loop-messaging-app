'use client'

import React from 'react'

interface LordIconProps {
  src: string
  trigger?: 'hover' | 'click' | 'loop' | 'loop-on-hover' | 'morph' | 'boomerang' | 'none'
  size?: number
  colors?: string
  delay?: number
  className?: string
  style?: React.CSSProperties
}

// Verified free icons from lordicon.com CDN (wired-flat style)
// If any returns 404, browse https://lordicon.com/icons and copy the JSON URL
export const Icons = {
  search:   'https://cdn.lordicon.com/msoeawqm.json',  // magnifier
  settings: 'https://cdn.lordicon.com/hwjcdycb.json',  // gear
  user:     'https://cdn.lordicon.com/fmjvulyw.json',  // person
  message:  'https://cdn.lordicon.com/kthelypq.json',  // chat bubble
  bell:     'https://cdn.lordicon.com/lbjnfzpa.json',  // bell
  plus:     'https://cdn.lordicon.com/iskjjstq.json',  // plus
  trash:    'https://cdn.lordicon.com/skkahier.json',  // trash
  edit:     'https://cdn.lordicon.com/wuvorscb.json',  // pen/edit
  send:     'https://cdn.lordicon.com/nqtddedc.json',  // paper plane
  close:    'https://cdn.lordicon.com/nqjpbmvb.json',  // x
  attach:   'https://cdn.lordicon.com/ppyvfomi.json',  // paperclip
  emoji:    'https://cdn.lordicon.com/zyzoecaw.json',  // smiley
} as const

// Uses React.createElement to avoid TypeScript JSX intrinsic element issues
// with web components in React 19+ (lord-icon is a custom element)
export function LordIcon({ src, trigger = 'hover', size = 20, colors, delay, className, style }: LordIconProps) {
  return React.createElement('lord-icon', {
    src,
    trigger,
    colors,
    delay,
    className,
    style: { width: size, height: size, display: 'inline-flex', ...style },
  })
}
