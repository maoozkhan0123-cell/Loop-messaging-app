"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProjectTask } from "@/types/database";
import { labelBelongsToTask, parseTaskSharedMetadata } from "@/lib/taskMetadata";
import {
  applyTaskMutation,
  TaskDomainError,
  taskDetailsFromProjectTask,
  type ProjectTaskHydrationOptions,
  type TaskMutation,
} from "@/lib/taskMutations";
import {
  createDefaultTaskUiPreferences,
  createEmptyTaskStore,
  loadTaskStore,
  loadTaskUiPreferences,
  persistTaskStore,
  persistTaskUiPreferences,
  subscribeToTaskStorage,
  TASK_STORAGE_KEY,
  TASK_UI_PREFERENCES_KEY,
  type TaskStorageLike,
} from "@/lib/taskPersistence";
import type {
  ActivityEvent,
  ActivityFilter,
  Checklist,
  ChecklistItem,
  DependencyRelation,
  LabelColor,
  TaskAttachment,
  TaskComment,
  TaskCover,
  TaskDependency,
  TaskDetails,
  TaskEstimate,
  TaskLabel,
  TaskMutationContext,
  TaskMutationResult,
  TaskMember,
  TaskPersistenceIssue,
  TaskPriority,
  TaskReminder,
  TaskStatus,
  TaskStoreState,
  TaskTrashEntry,
  TaskUiPreferences,
} from "@/types/task";

export type { Checklist, ChecklistItem, TaskDetails };
export type Member = TaskMember;
export type Comment = TaskComment;
export type ActivityLog = ActivityEvent;

export interface TaskDetailsStoreSnapshot {
  state: TaskStoreState;
  preferences: TaskUiPreferences;
  hydrated: boolean;
  persistenceError?: TaskPersistenceIssue;
  mutationError?: TaskDomainError;
}

const SERVER_SNAPSHOT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const SERVER_TASK_DETAILS_SNAPSHOT: TaskDetailsStoreSnapshot = {
  state: createEmptyTaskStore(SERVER_SNAPSHOT_TIMESTAMP),
  preferences: createDefaultTaskUiPreferences(SERVER_SNAPSHOT_TIMESTAMP),
  hydrated: false,
};

function sessionOnlyIssue(issue: TaskPersistenceIssue): TaskPersistenceIssue {
  if (issue.code !== "unavailable") return issue;
  return {
    ...issue,
    message:
      "Local task storage is unavailable. Changes will be kept for this tab only and may be lost when it closes.",
  };
}

export type TaskActionOutcome =
  | { ok: true; result: TaskMutationResult }
  | { ok: false; error: TaskDomainError | TaskPersistenceIssue };

type StoreListener = () => void;
type TaskBoundMutation = TaskMutation extends infer Mutation
  ? Mutation extends { taskId: string }
    ? Omit<Mutation, "taskId">
    : never
  : never;

/**
 * Small external store shared by every hook consumer in the tab. This avoids a
 * modal-local copy of task data while keeping the persistence adapter swappable.
 */
export class TaskDetailsStore {
  private listeners = new Set<StoreListener>();
  private stopStorageListener?: () => void;
  private taskStorageUnavailable = false;
  private preferenceStorageUnavailable = false;
  private snapshot: TaskDetailsStoreSnapshot = {
    state: createEmptyTaskStore(),
    preferences: createDefaultTaskUiPreferences(),
    hydrated: false,
  };

  constructor(private readonly storage?: TaskStorageLike | null) {}

  getSnapshot = (): TaskDetailsStoreSnapshot => this.snapshot;
  getServerSnapshot = (): TaskDetailsStoreSnapshot =>
    SERVER_TASK_DETAILS_SNAPSHOT;

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(next: TaskDetailsStoreSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  hydrate() {
    if (this.snapshot.hydrated) return;
    const tasks = loadTaskStore(this.storage);
    const preferences = loadTaskUiPreferences(this.storage);
    this.taskStorageUnavailable = tasks.issue?.code === "unavailable";
    this.preferenceStorageUnavailable =
      preferences.issue?.code === "unavailable";
    const persistenceError = tasks.issue ?? preferences.issue;
    this.emit({
      state: tasks.data,
      preferences: preferences.data,
      hydrated: true,
      persistenceError: persistenceError
        ? sessionOnlyIssue(persistenceError)
        : undefined,
    });
    // Browser storage events belong only to the implicit localStorage adapter.
    // An explicitly supplied adapter may represent a test store or a future
    // backend cache and must not be overwritten by unrelated window events.
    if (
      typeof window !== "undefined" &&
      this.storage === undefined &&
      !this.taskStorageUnavailable &&
      !this.stopStorageListener
    ) {
      this.stopStorageListener = subscribeToTaskStorage((change) => {
        if (change.key === TASK_STORAGE_KEY && change.tasks) {
          if (change.tasks.issue && change.tasks.source === "recovered") {
            this.emit({
              ...this.snapshot,
              persistenceError: change.tasks.issue,
            });
            return;
          }
          if (change.tasks.data.revision >= this.snapshot.state.revision) {
            this.emit({
              ...this.snapshot,
              state: change.tasks.data,
              persistenceError: change.tasks.issue,
            });
          }
        }
        if (change.key === TASK_UI_PREFERENCES_KEY && change.preferences) {
          if (
            change.preferences.issue &&
            change.preferences.source === "recovered"
          ) {
            this.emit({
              ...this.snapshot,
              persistenceError: change.preferences.issue,
            });
            return;
          }
          if (
            change.preferences.data.revision >=
            this.snapshot.preferences.revision
          ) {
            this.emit({
              ...this.snapshot,
              preferences: change.preferences.data,
              persistenceError: change.preferences.issue,
            });
          }
        }
      });
    }
  }

  seed(task: TaskDetails, context: TaskMutationContext): TaskActionOutcome {
    const mutation: TaskMutation = { type: "seed_task", task };
    const outcome = this.dispatch(mutation, context);

    // Seeding is an idempotent reconciliation with the shared project task.
    // If another tab won the compare-before-write race, dispatch adopts that
    // newer snapshot. Replay once against the winner so a newly opened task is
    // not left visible through the render fallback but absent from the store.
    if (!outcome.ok && outcome.error.code === "conflict") {
      return this.dispatch(mutation, context);
    }

    return outcome;
  }

  dispatch(
    mutation: TaskMutation,
    context: TaskMutationContext,
  ): TaskActionOutcome {
    try {
      const previous = this.snapshot.state;
      const result = applyTaskMutation(previous, mutation, context);
      if (!result.changed) {
        if (this.snapshot.mutationError) this.emit({ ...this.snapshot, mutationError: undefined });
        return { ok: true, result };
      }
      if (this.taskStorageUnavailable) {
        this.emit({
          ...this.snapshot,
          state: result.state,
          persistenceError: sessionOnlyIssue({
            code: "unavailable",
            message: "Local task storage is unavailable.",
            recoverable: true,
          }),
          mutationError: undefined,
        });
        return { ok: true, result };
      }
      const saved = persistTaskStore(result.state, {
        storage: this.storage,
        expectedRevision: previous.revision,
      });
      if (!saved.ok) {
        if (saved.issue.code === "unavailable") {
          // Keep the workspace functional when localStorage is blocked (for
          // example, hardened privacy settings). The visible warning makes the
          // session-only durability explicit instead of reporting fake saving.
          this.emit({
            ...this.snapshot,
            state: result.state,
            persistenceError: sessionOnlyIssue(saved.issue),
            mutationError: undefined,
          });
          this.taskStorageUnavailable = true;
          return { ok: true, result };
        }
        // On a conflict, adopt the winner before asking the caller to retry.
        const latest =
          saved.issue.code === "conflict"
            ? loadTaskStore(this.storage).data
            : previous;
        this.emit({
          ...this.snapshot,
          state: latest,
          persistenceError: saved.issue,
          mutationError: undefined,
        });
        return { ok: false, error: saved.issue };
      }
      this.emit({
        ...this.snapshot,
        state: result.state,
        persistenceError: undefined,
        mutationError: undefined,
      });
      return { ok: true, result };
    } catch (cause) {
      const error =
        cause instanceof TaskDomainError
          ? cause
          : new TaskDomainError(
              cause instanceof Error ? cause.message : "Task change failed.",
              "invalid_input",
            );
      this.emit({ ...this.snapshot, mutationError: error });
      return { ok: false, error };
    }
  }

  updatePreferences(
    patch: Partial<
      Pick<
        TaskUiPreferences,
        "activityFilter" | "isFullscreen" | "detailsPanel"
      >
    >,
  ): boolean {
    const previous = this.snapshot.preferences;
    const next: TaskUiPreferences = {
      ...previous,
      ...patch,
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (
      next.activityFilter === previous.activityFilter &&
      next.isFullscreen === previous.isFullscreen &&
      next.detailsPanel === previous.detailsPanel
    )
      return true;
    if (this.preferenceStorageUnavailable) {
      this.emit({
        ...this.snapshot,
        preferences: next,
        persistenceError: sessionOnlyIssue({
          code: "unavailable",
          message: "Local task storage is unavailable.",
          recoverable: true,
        }),
      });
      return true;
    }
    const saved = persistTaskUiPreferences(next, {
      storage: this.storage,
      expectedRevision: previous.revision,
    });
    if (!saved.ok) {
      if (saved.issue.code === "unavailable") {
        this.emit({
          ...this.snapshot,
          preferences: next,
          persistenceError: sessionOnlyIssue(saved.issue),
        });
        this.preferenceStorageUnavailable = true;
        return true;
      }
      const preferences =
        saved.issue.code === "conflict"
          ? loadTaskUiPreferences(this.storage).data
          : previous;
      this.emit({
        ...this.snapshot,
        preferences,
        persistenceError: saved.issue,
      });
      return false;
    }
    this.emit({
      ...this.snapshot,
      preferences: next,
      persistenceError: undefined,
    });
    return true;
  }

  clearError() {
    if (!this.snapshot.persistenceError && !this.snapshot.mutationError) return;
    this.emit({
      ...this.snapshot,
      persistenceError: undefined,
      mutationError: undefined,
    });
  }

  /** Useful for tests and explicit app teardown; normal consumers never call it. */
  destroy() {
    this.stopStorageListener?.();
    this.stopStorageListener = undefined;
    this.listeners.clear();
  }
}

const defaultTaskDetailsStore = new TaskDetailsStore();

export function createTaskDetailsStore(
  storage?: TaskStorageLike | null,
): TaskDetailsStore {
  return new TaskDetailsStore(storage);
}

export interface UseTaskDetailsOptions extends ProjectTaskHydrationOptions {
  actorId?: string;
  canManageAllComments?: boolean;
  store?: TaskDetailsStore;
  skipSharedMetadataHydration?: boolean;
  onTaskChange?: (
    task: TaskDetails | undefined,
    mutation: TaskMutation,
    state: TaskStoreState,
  ) => void | Promise<void>;
}

export interface UseTaskDetailsResult {
  task?: TaskDetails;
  comments: TaskComment[];
  activity: ActivityEvent[];
  dependencies: TaskDependency[];
  /** Labels assigned to the current task. */
  labels: TaskLabel[];
  /** This task's label catalog, including labels previously removed from it. */
  allLabels: TaskLabel[];
  attachments: TaskAttachment[];
  trash: TaskTrashEntry[];
  allTasks: TaskDetails[];
  preferences: TaskUiPreferences;
  hydrated: boolean;
  persistenceError?: TaskPersistenceIssue;
  mutationError?: TaskDomainError;
  clearError: () => void;
  dispatch: (mutation: TaskMutation) => TaskActionOutcome;
  seedComments: (comments: TaskComment[]) => TaskActionOutcome;

  updateTitle: (title: string) => TaskActionOutcome;
  updateDescription: (description: string) => TaskActionOutcome;
  setCover: (cover?: TaskCover) => TaskActionOutcome;
  updateStatus: (status: TaskStatus, columnId?: string) => TaskActionOutcome;
  updatePriority: (priority: TaskPriority) => TaskActionOutcome;
  setDates: (dates: {
    startDate?: string;
    dueDate?: string;
    reminder?: TaskReminder;
  }) => TaskActionOutcome;
  setEstimate: (estimate?: TaskEstimate) => TaskActionOutcome;
  assignMember: (memberId: string) => TaskActionOutcome;
  unassignMember: (memberId: string) => TaskActionOutcome;
  /** Assign or remove a member based on current membership. */
  toggleMember: (memberId: string) => TaskActionOutcome;
  createLabel: (name: string, color: LabelColor) => TaskActionOutcome;
  updateLabel: (
    labelId: string,
    patch: { name?: string; color?: LabelColor },
  ) => TaskActionOutcome;
  deleteLabel: (labelId: string) => TaskActionOutcome;
  addLabel: (labelId: string) => TaskActionOutcome;
  removeLabel: (labelId: string) => TaskActionOutcome;
  addChecklist: (title: string) => TaskActionOutcome;
  renameChecklist: (checklistId: string, title: string) => TaskActionOutcome;
  deleteChecklist: (checklistId: string) => TaskActionOutcome;
  toggleChecklistVisibility: (checklistId: string) => TaskActionOutcome;
  reorderChecklists: (orderedIds: string[]) => TaskActionOutcome;
  addChecklistItem: (checklistId: string, text: string) => TaskActionOutcome;
  /** Convenience alias for addChecklistItem. */
  addItem: (checklistId: string, text: string) => TaskActionOutcome;
  updateChecklistItem: (
    checklistId: string,
    itemId: string,
    patch: {
      text?: string;
      completed?: boolean;
      assigneeId?: string | null;
      dueDate?: string | null;
    },
  ) => TaskActionOutcome;
  toggleChecklistItem: (
    checklistId: string,
    itemId: string,
  ) => TaskActionOutcome;
  /** Convenience alias for toggleChecklistItem. */
  toggleItem: (checklistId: string, itemId: string) => TaskActionOutcome;
  deleteChecklistItem: (
    checklistId: string,
    itemId: string,
  ) => TaskActionOutcome;
  /** Convenience alias for deleteChecklistItem. */
  deleteItem: (checklistId: string, itemId: string) => TaskActionOutcome;
  reorderChecklistItems: (
    checklistId: string,
    orderedIds: string[],
  ) => TaskActionOutcome;
  addComment: (
    body: string,
    parentCommentId?: string,
    mentionIds?: string[],
    attachmentIds?: string[],
    source?: { id?: string; authorId?: string; createdAt?: string },
  ) => TaskActionOutcome;
  updateComment: (commentId: string, body: string) => TaskActionOutcome;
  deleteComment: (commentId: string) => TaskActionOutcome;
  toggleReaction: (
    commentId: string,
    emoji: string,
    userId?: string,
  ) => TaskActionOutcome;
  addDependency: (
    targetTaskId: string,
    relation: DependencyRelation,
  ) => TaskActionOutcome;
  removeDependency: (dependencyId: string) => TaskActionOutcome;
  addAttachmentMetadata: (
    attachment: Omit<TaskAttachment, "taskId" | "createdAt"> & {
      createdAt?: string;
    },
  ) => TaskActionOutcome;
  removeAttachment: (attachmentId: string) => TaskActionOutcome;
  toggleWatch: (userId?: string) => TaskActionOutcome;
  duplicateTask: (options?: {
    newTaskId?: string;
    title?: string;
    includeChecklists?: boolean;
    includeDependencies?: boolean;
  }) => TaskActionOutcome;
  moveTask: (destination: {
    boardId: string;
    projectId: string;
    columnId: string;
    status: TaskStatus;
  }) => TaskActionOutcome;
  setParent: (parentTaskId?: string) => TaskActionOutcome;
  archiveTask: () => TaskActionOutcome;
  restoreTask: () => TaskActionOutcome;
  deleteTask: () => TaskActionOutcome;
  restoreFromTrash: (trashId: string) => TaskActionOutcome;
  permanentlyDelete: (trashId: string) => TaskActionOutcome;
  setActivityFilter: (filter: ActivityFilter) => boolean;
  setFullscreen: (fullscreen: boolean) => boolean;
  setDetailsPanel: (panel: "details" | "activity") => boolean;
}

function failedTaskOutcome(): TaskActionOutcome {
  return {
    ok: false,
    error: new TaskDomainError("Task is not available.", "not_found"),
  };
}

export function useTaskDetails(
  projectTask: ProjectTask | null | undefined,
  options: UseTaskDetailsOptions = {},
): UseTaskDetailsResult {
  const store = options.store ?? defaultTaskDetailsStore;
  const {
    status,
    columnName,
    taskKey,
    projectId,
    now,
    canManageAllComments,
    onTaskChange,
  } = options;
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const seed = useMemo(
    () =>
      projectTask
        ? taskDetailsFromProjectTask(projectTask, {
            status,
            columnName,
            taskKey,
            projectId,
            now,
          })
        : undefined,
    [projectTask, status, columnName, taskKey, projectId, now],
  );
  const actorId =
    options.actorId?.trim() || projectTask?.created_by || "local-user";
  const taskId = projectTask?.id;
  const sharedSignature = JSON.stringify({
    metadata: parseTaskSharedMetadata(projectTask?.task_metadata),
    assigneeIds: projectTask?.assignee_ids,
  });
  const hydratedShared = useRef<{ store: TaskDetailsStore; taskId: string; signature: string } | undefined>(undefined);
  const trashed = taskId
    ? Object.values(snapshot.state.trash).some(
        (entry) => entry.task.id === taskId,
      )
    : false;

  useEffect(() => {
    store.hydrate();
  }, [store]);

  useEffect(() => {
    if (!snapshot.hydrated || !seed || trashed) return;
    store.seed(seed, { actorId, canManageAllComments });
  }, [
    store,
    snapshot.hydrated,
    seed,
    actorId,
    canManageAllComments,
    trashed,
  ]);
  useEffect(() => {
    if (!snapshot.hydrated || !taskId || trashed || options.skipSharedMetadataHydration) return;
    if (hydratedShared.current?.store === store && hydratedShared.current.taskId === taskId && hydratedShared.current.signature === sharedSignature) return;
    const incoming = JSON.parse(sharedSignature) as { metadata?: import('@/types/task').TaskSharedMetadata; assigneeIds?: string[] };
    if (!incoming.metadata && incoming.assigneeIds === undefined) return;
    const outcome = store.dispatch({ type: 'hydrate_shared_metadata', taskId, ...incoming }, { actorId, canManageAllComments });
    if (outcome.ok) hydratedShared.current = { store, taskId, signature: sharedSignature };
  }, [store, snapshot.hydrated, taskId, trashed, sharedSignature, options.skipSharedMetadataHydration, actorId, canManageAllComments]);
  // Hydration and the seed mutation happen in consecutive effects. Keep the
  // shared ProjectTask seed available during that hand-off (and when storage
  // is unavailable) so the workspace never flashes back to an empty task.
  // A trash tombstone still wins, preventing deleted tasks from resurfacing.
  const task = taskId
    ? (snapshot.state.tasks[taskId] ?? (!trashed ? seed : undefined))
    : undefined;

  const dispatch = useCallback(
    (mutation: TaskMutation): TaskActionOutcome => {
      const outcome = store.dispatch(mutation, {
        actorId,
        canManageAllComments,
      });
      if (outcome.ok && outcome.result.changed && onTaskChange) {
        const nextTaskId = outcome.result.taskId ?? taskId;
        void onTaskChange(
          nextTaskId ? outcome.result.state.tasks[nextTaskId] : undefined,
          mutation,
          outcome.result.state,
        );
      }
      return outcome;
    },
    [store, actorId, canManageAllComments, onTaskChange, taskId],
  );

  const forTask = useCallback(
    (mutation: TaskBoundMutation): TaskActionOutcome => {
      if (!taskId) return failedTaskOutcome();
      return dispatch({ ...mutation, taskId } as TaskMutation);
    },
    [dispatch, taskId],
  );

  const comments = useMemo(
    () =>
      task
        ? task.commentIds
            .map((id) => snapshot.state.comments[id])
            .filter((item): item is TaskComment => Boolean(item))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    [task, snapshot.state.comments],
  );
  const activity = useMemo(
    () =>
      task
        ? Object.values(snapshot.state.activity)
            .filter((item) => item.taskId === task.id)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        : [],
    [task, snapshot.state.activity],
  );
  const dependencies = useMemo(
    () =>
      task
        ? task.dependencyIds
            .map((id) => snapshot.state.dependencies[id])
            .filter((item): item is TaskDependency => Boolean(item))
        : [],
    [task, snapshot.state.dependencies],
  );
  const labels = useMemo(
    () =>
      task
        ? task.labelIds
            .map((id) => snapshot.state.labels[id])
            .filter((item): item is TaskLabel => Boolean(item))
        : [],
    [task, snapshot.state.labels],
  );
  const attachments = useMemo(
    () =>
      task
        ? task.attachmentIds
            .map((id) => snapshot.state.attachments[id])
            .filter((item): item is TaskAttachment => Boolean(item))
        : [],
    [task, snapshot.state.attachments],
  );

  return {
    task,
    comments,
    activity,
    dependencies,
    labels,
    allLabels: Object.values(snapshot.state.labels).filter(label => task && (task.labelIds.includes(label.id) || labelBelongsToTask(task.id, label.id))).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    attachments,
    trash: Object.values(snapshot.state.trash).sort((a, b) =>
      b.deletedAt.localeCompare(a.deletedAt),
    ),
    allTasks: Object.values(snapshot.state.tasks),
    preferences: snapshot.preferences,
    hydrated: snapshot.hydrated,
    persistenceError: snapshot.persistenceError,
    mutationError: snapshot.mutationError,
    clearError: () => store.clearError(),
    dispatch,
    seedComments: (seedComments) =>
      taskId
        ? dispatch({ type: "seed_comments", taskId, comments: seedComments })
        : failedTaskOutcome(),
    updateTitle: (title) => forTask({ type: "update_title", title }),
    updateDescription: (description) =>
      forTask({ type: "update_description", description }),
    setCover: (cover) => forTask({ type: "set_cover", cover }),
    updateStatus: (status, columnId) =>
      forTask({ type: "update_status", status, columnId }),
    updatePriority: (priority) =>
      forTask({ type: "update_priority", priority }),
    setDates: (dates) => forTask({ type: "set_dates", ...dates }),
    setEstimate: (estimate) => forTask({ type: "set_estimate", estimate }),
    assignMember: (memberId) => forTask({ type: "assign_member", memberId }),
    unassignMember: (memberId) =>
      forTask({ type: "unassign_member", memberId }),
    toggleMember: (memberId) =>
      task?.assigneeIds.includes(memberId)
        ? forTask({ type: "unassign_member", memberId })
        : forTask({ type: "assign_member", memberId }),
    createLabel: (name, color) =>
      forTask({ type: "create_label", name, color }),
    updateLabel: (labelId, patch) =>
      forTask({ type: "update_label", labelId, patch }),
    deleteLabel: (labelId) => forTask({ type: "delete_label", labelId }),
    addLabel: (labelId) => forTask({ type: "add_label", labelId }),
    removeLabel: (labelId) => forTask({ type: "remove_label", labelId }),
    addChecklist: (title) => forTask({ type: "add_checklist", title }),
    renameChecklist: (checklistId, title) =>
      forTask({ type: "rename_checklist", checklistId, title }),
    deleteChecklist: (checklistId) =>
      forTask({ type: "delete_checklist", checklistId }),
    toggleChecklistVisibility: (checklistId) =>
      forTask({ type: "toggle_checklist_visibility", checklistId }),
    reorderChecklists: (orderedIds) =>
      forTask({ type: "reorder_checklists", orderedIds }),
    addChecklistItem: (checklistId, text) =>
      forTask({ type: "add_checklist_item", checklistId, text }),
    addItem: (checklistId, text) =>
      forTask({ type: "add_checklist_item", checklistId, text }),
    updateChecklistItem: (checklistId, itemId, patch) =>
      forTask({ type: "update_checklist_item", checklistId, itemId, patch }),
    toggleChecklistItem: (checklistId, itemId) =>
      forTask({ type: "toggle_checklist_item", checklistId, itemId }),
    toggleItem: (checklistId, itemId) =>
      forTask({ type: "toggle_checklist_item", checklistId, itemId }),
    deleteChecklistItem: (checklistId, itemId) =>
      forTask({ type: "delete_checklist_item", checklistId, itemId }),
    deleteItem: (checklistId, itemId) =>
      forTask({ type: "delete_checklist_item", checklistId, itemId }),
    reorderChecklistItems: (checklistId, orderedIds) =>
      forTask({ type: "reorder_checklist_items", checklistId, orderedIds }),
    addComment: (body, parentCommentId, mentionIds, attachmentIds, source) =>
      forTask({
        type: "add_comment",
        body,
        parentCommentId,
        mentionIds,
        attachmentIds,
        commentId: source?.id,
        authorId: source?.authorId,
        createdAt: source?.createdAt,
      }),
    updateComment: (commentId, body) =>
      dispatch({ type: "update_comment", commentId, body }),
    deleteComment: (commentId) =>
      dispatch({ type: "delete_comment", commentId }),
    toggleReaction: (commentId, emoji, userId) =>
      dispatch({ type: "toggle_reaction", commentId, emoji, userId }),
    addDependency: (targetTaskId, relation) =>
      forTask({ type: "add_dependency", targetTaskId, relation }),
    removeDependency: (dependencyId) =>
      forTask({ type: "remove_dependency", dependencyId }),
    addAttachmentMetadata: (attachment) =>
      forTask({ type: "add_attachment", attachment }),
    removeAttachment: (attachmentId) =>
      forTask({ type: "remove_attachment", attachmentId }),
    toggleWatch: (userId) => forTask({ type: "toggle_watch", userId }),
    duplicateTask: (duplicateOptions = {}) =>
      forTask({ type: "duplicate_task", ...duplicateOptions }),
    moveTask: (destination) => forTask({ type: "move_task", ...destination }),
    setParent: (parentTaskId) => forTask({ type: "set_parent", parentTaskId }),
    archiveTask: () => forTask({ type: "archive_task" }),
    restoreTask: () => forTask({ type: "restore_task" }),
    deleteTask: () => forTask({ type: "delete_task" }),
    restoreFromTrash: (trashId) =>
      dispatch({ type: "restore_from_trash", trashId }),
    permanentlyDelete: (trashId) =>
      dispatch({ type: "permanently_delete", trashId }),
    setActivityFilter: (activityFilter) =>
      store.updatePreferences({ activityFilter }),
    setFullscreen: (isFullscreen) => store.updatePreferences({ isFullscreen }),
    setDetailsPanel: (detailsPanel) =>
      store.updatePreferences({ detailsPanel }),
  };
}
