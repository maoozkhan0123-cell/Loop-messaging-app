'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type {
  Idea,
  IdeaStatus,
  IdeaComment,
  Profile
} from '@/types/database'

export function useIdeas() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['ideas'],
    queryFn: async () => {
      const { data: ideasData, error: ideasErr } = await supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false })

      if (ideasErr) throw ideasErr
      if (!ideasData || ideasData.length === 0) return []

      const typedIdeas = ideasData as Idea[]
      const ideaIds = typedIdeas.map((i: Idea) => i.id)

      // Fetch authors
      const authorIds = Array.from(
        new Set(typedIdeas.map((i: Idea) => i.author_id).filter(Boolean))
      ) as string[]

      let profilesMap: Record<string, Profile> = {}
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', authorIds)

        if (profiles) {
          const typedProfiles = profiles as Profile[]
          profilesMap = Object.fromEntries(typedProfiles.map((p: Profile) => [p.id, p]))
        }
      }

      // Fetch comments count
      const { data: commentsData } = await supabase
        .from('idea_comments')
        .select('idea_id')
        .in('idea_id', ideaIds)

      const commentsCountMap: Record<string, number> = {}
      if (commentsData) {
        (commentsData as Array<{ idea_id: string }>).forEach((c) => {
          commentsCountMap[c.idea_id] = (commentsCountMap[c.idea_id] || 0) + 1
        })
      }

      return typedIdeas.map((i: Idea) => ({
        ...i,
        author: i.author_id ? profilesMap[i.author_id] : undefined,
        comments_count: commentsCountMap[i.id] || 0
      })) as Idea[]
    }
  })

  // Realtime updates subscription
  useEffect(() => {
    const channel = supabase
      .channel('ideas_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['ideas'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'idea_comments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['ideas'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient])

  // Mutation: Submit new Idea
  const createIdeaMutation = useMutation({
    mutationFn: async ({
      title,
      description
    }: {
      title: string
      description: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('ideas')
        .insert({
          title: title.trim(),
          description: description.trim(),
          author_id: user.id
        })
        .select()
        .single()

      if (error) throw error
      return data as Idea
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
    }
  })

  // Mutation: Update Idea Status
  const updateIdeaStatusMutation = useMutation({
    mutationFn: async ({ ideaId, status }: { ideaId: string; status: IdeaStatus }) => {
      const { data, error } = await supabase
        .from('ideas')
        .update({ status })
        .eq('id', ideaId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
    }
  })

  // Mutation: Delete Idea
  const deleteIdeaMutation = useMutation({
    mutationFn: async (ideaId: string) => {
      const { error } = await supabase.from('ideas').delete().eq('id', ideaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
    }
  })

  // Mutation: Add Comment on Idea
  const addIdeaCommentMutation = useMutation({
    mutationFn: async ({ ideaId, content }: { ideaId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('idea_comments')
        .insert({ idea_id: ideaId, author_id: user.id, content: content.trim() })
        .select()
        .single()

      if (error) throw error
      return data as IdeaComment
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['idea_comments', vars.ideaId] })
      queryClient.invalidateQueries({ queryKey: ['ideas'] })
    }
  })

  return {
    ideas: query.data || [],
    isLoading: query.isLoading,
    createIdea: createIdeaMutation.mutateAsync,
    updateStatus: updateIdeaStatusMutation.mutateAsync,
    deleteIdea: deleteIdeaMutation.mutateAsync,
    addComment: addIdeaCommentMutation.mutateAsync
  }
}

export function useIdeaComments(ideaId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['idea_comments', ideaId],
    enabled: !!ideaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('idea_comments')
        .select('*')
        .eq('idea_id', ideaId)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!data || data.length === 0) return []

      const typedData = data as IdeaComment[]
      const authorIds = Array.from(
        new Set(typedData.map((c: IdeaComment) => c.author_id).filter(Boolean))
      ) as string[]

      let profilesMap: Record<string, Profile> = {}
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', authorIds)

        if (profiles) {
          const typedProfiles = profiles as Profile[]
          profilesMap = Object.fromEntries(typedProfiles.map((p: Profile) => [p.id, p]))
        }
      }

      return typedData.map((c: IdeaComment) => ({
        ...c,
        author: c.author_id ? profilesMap[c.author_id] : undefined
      })) as IdeaComment[]
    }
  })
}
