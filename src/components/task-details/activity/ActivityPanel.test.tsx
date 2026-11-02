import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityPanel, type ActivityActions } from './ActivityPanel'
import type { ActivityFilter } from '@/types/task'

describe('ActivityPanel',() => {
  it('preserves composer drafts across filters and stores stable mention IDs',async () => {
    const addComment=vi.fn().mockResolvedValue(undefined)
    function Harness() {
      const [filter,setFilter]=useState<ActivityFilter>('comments')
      const actions:ActivityActions={setFilter,addComment,updateComment:vi.fn(),deleteComment:vi.fn(),toggleReaction:vi.fn()}
      return <ActivityPanel comments={[]} activity={[]} attachments={[]} members={[{id:'member-1',name:'Ada Lovelace',initials:'AL'}]} currentUserId="member-1" filter={filter} actions={actions} onUploadFiles={vi.fn().mockResolvedValue([])}/>
    }
    render(<Harness/>)

    const composer=screen.getByRole('combobox',{name:'Write a comment'})
    fireEvent.change(composer,{target:{value:'Draft for later'}})
    fireEvent.click(screen.getByRole('tab',{name:/history/i}))
    expect(composer.closest('.hidden')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab',{name:/comments/i}))
    expect(composer.closest('.hidden')).toBeNull()
    expect(composer).toHaveValue('Draft for later')

    fireEvent.change(composer,{target:{value:'Review with @ada'}})
    fireEvent.keyDown(composer,{key:'Enter'})
    expect(composer).toHaveValue('Review with @AdaLovelace ')
    fireEvent.keyDown(composer,{key:'Enter',ctrlKey:true})

    await waitFor(() => expect(addComment).toHaveBeenCalledWith('Review with @AdaLovelace',undefined,['member-1'],[]))
  })
})
