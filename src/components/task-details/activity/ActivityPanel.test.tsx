import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityPanel, type ActivityActions } from './ActivityPanel'
import type { ActivityFilter, TaskComment } from '@/types/task'

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
    const feed=document.getElementById('activity-feed')
    expect(feed).not.toContainElement(composer)
    expect(feed?.nextElementSibling).toContainElement(composer)
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

  it('supports comment replies, editing, deletion, and accessible reactions',async () => {
    const reaction='\u2705'
    const comments:TaskComment[]=[
      {id:'comment-1',taskId:'task-1',authorId:'member-1',body:'Ready for review',mentionIds:[],attachmentIds:[],reactions:{[reaction]:['member-1']},createdAt:'2026-11-02T10:00:00.000Z'},
      {id:'comment-2',taskId:'task-1',authorId:'member-2',parentCommentId:'comment-1',body:'I will review it',mentionIds:[],attachmentIds:[],reactions:{},createdAt:'2026-11-02T10:05:00.000Z'},
    ]
    const actions:ActivityActions={setFilter:vi.fn(),addComment:vi.fn(),updateComment:vi.fn(),deleteComment:vi.fn(),toggleReaction:vi.fn()}
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<ActivityPanel comments={comments} activity={[]} attachments={[]} members={[{id:'member-1',name:'Ada Lovelace',initials:'AL'},{id:'member-2',name:'Grace Hopper',initials:'GH'}]} currentUserId="member-1" filter="comments" actions={actions}/>)

    expect(screen.getByText('Ready for review')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'1 reply'}))
    expect(screen.getByText('I will review it')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button',{name:/Remove .* reaction, 1 person reacted/}))
    expect(actions.toggleReaction).toHaveBeenCalledWith('comment-1',reaction)

    fireEvent.click(screen.getByRole('button',{name:'Edit comment'}))
    const editor=screen.getByRole('textbox')
    fireEvent.change(editor,{target:{value:'  Updated review note  '}})
    fireEvent.keyDown(editor,{key:'Enter',ctrlKey:true})
    expect(actions.updateComment).toHaveBeenCalledWith('comment-1','Updated review note')

    fireEvent.click(screen.getByRole('button',{name:'Reply'}))
    const reply=screen.getByPlaceholderText('Write a reply')
    expect(reply).toHaveFocus()
    fireEvent.change(reply,{target:{value:'  Thanks  '}})
    fireEvent.keyDown(reply,{key:'Enter',ctrlKey:true})
    expect(actions.addComment).toHaveBeenCalledWith('Thanks','comment-1')

    fireEvent.click(screen.getByRole('button',{name:'Delete comment'}))
    expect(confirm).toHaveBeenCalledWith('Delete this comment?')
    await waitFor(() => expect(actions.deleteComment).toHaveBeenCalledWith('comment-1'))
    confirm.mockRestore()
  })
})
