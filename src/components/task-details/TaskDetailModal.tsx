"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Bell,
  BellOff,
  ChevronDown,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { useTaskDetails, type TaskActionOutcome } from "@/hooks/useTaskDetails";
import {
  addAttachmentBlob,
  createAttachmentStorageKey,
  createAttachmentTaskStoragePrefix,
  deleteAttachmentBlob,
} from "@/lib/attachmentStorage";
import { taskDetailsFromProjectTask } from "@/lib/taskMutations";
import { deleteTaskCoverImage } from "@/lib/taskCover";
import { TaskTitleEditor } from "./TaskTitleEditor";
import { TaskCover } from "./TaskCover";
import { TaskQuickActions } from "./TaskQuickActions";
import { TaskProperties } from "./TaskProperties";
import { TaskDescriptionEditor } from "./TaskDescriptionEditor";
import { TaskCommandPalette } from "./TaskCommandPalette";
import { TaskActionsMenu } from "./TaskActionsMenu";
import { ChecklistSection } from "./checklists/ChecklistSection";
import { AttachmentSection } from "./attachments/AttachmentSection";
import { ActivityPanel } from "./activity/ActivityPanel";
import { LinkedWork } from "./LinkedWork";
import type {
  Profile,
  ProjectBoard,
  ProjectColumn,
  ProjectTask,
  ProjectTaskComment,
  TaskPriority as ProjectPriority,
} from "@/types/database";
import type {
  TaskAttachment,
  TaskComment,
  TaskDetails,
  TaskMember,
  TaskPriority,
  TaskStatus,
  TaskTrashEntry,
} from "@/types/task";

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "#64748B" },
  todo: { label: "To Do", color: "#3B82F6" },
  in_progress: { label: "In Progress", color: "#F59E0B" },
  in_review: { label: "In Review", color: "#8B5CF6" },
  done: { label: "Done", color: "#10B981" },
};

type UpdateTaskParams = {
  taskId: string;
  title?: string;
  description?: string;
  priority?: ProjectPriority;
  columnId?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  estimatedHours?: number | null;
  archivedAt?: string | null;
};

export interface TaskDetailModalProps {
  task: ProjectTask;
  columns: ProjectColumn[];
  availableColumns?: ProjectColumn[];
  boards: ProjectBoard[];
  availableTasks: ProjectTask[];
  teamProfiles: Profile[];
  currentProfile?: Profile;
  initialComments: ProjectTaskComment[];
  onClose: () => void;
  onUpdate: (params: UpdateTaskParams) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onDuplicate: (task: ProjectTask, newTaskId?: string) => Promise<ProjectTask>;
  onMove: (params: {
    taskId: string;
    destinationBoardId: string;
  }) => Promise<ProjectTask>;
  onAddComment: (params: {
    taskId: string;
    comment: string;
  }) => Promise<ProjectTaskComment>;
}

export function TaskDetailModal(props: TaskDetailModalProps) {
  const {
    task: projectTask,
    columns,
    boards,
    availableTasks,
    teamProfiles,
    currentProfile,
    onClose,
    onUpdate,
    onDelete,
    onDuplicate,
    onMove,
    onAddComment,
    initialComments,
  } = props;
  const availableColumns = props.availableColumns ?? columns;
  const { toast } = useToast();
  const currentColumn = columns.find(
    (column) => column.id === projectTask.column_id,
  );
  const currentBoard = boards.find(
    (board) => board.id === projectTask.board_id,
  );
  const commentProfiles = useMemo(
    () =>
      initialComments.flatMap((comment) =>
        comment.profile ? [comment.profile] : [],
      ),
    [initialComments],
  );
  const members = useMemo<TaskMember[]>(
    () =>
      Array.from(
        new Map(
          [
            ...(currentProfile ? [currentProfile] : []),
            ...teamProfiles,
            ...commentProfiles,
          ].map((profile) => [
            profile.id,
            {
              id: profile.id,
              name: profile.display_name,
              email: profile.email || undefined,
              avatarUrl: profile.avatar_url || undefined,
              initials: initials(profile.display_name),
              role: profile.job_title || undefined,
            },
          ]),
        ).values(),
      ),
    [commentProfiles, currentProfile, teamProfiles],
  );
  const actorId = currentProfile?.id || projectTask.created_by || "local-user";
  const details = useTaskDetails(projectTask, {
    actorId,
    columnName: currentColumn?.name,
    projectId: projectTask.board_id,
    taskKey: `TASK-${projectTask.id.slice(0, 6).toUpperCase()}`,
    canManageAllComments: false,
  });
  const task = details.task;
  const dispatchTask = details.dispatch;
  const detailsHydrated = details.hydrated;
  const [mobilePanel, setMobilePanel] = useState<"details" | "activity">(
    details.preferences.detailsPanel,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [titleEditSignal, setTitleEditSignal] = useState(0);
  const [titleDirty, setTitleDirty] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [commentDirty, setCommentDirty] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const importedCommentsRef = useRef("");

  const taskCatalog = useMemo(() => {
    const catalog = new Map(details.allTasks.map((item) => [item.id, item]));
    availableTasks.forEach((item) => {
      const column = availableColumns.find(
        (candidate) => candidate.id === item.column_id,
      );
      const incoming = taskDetailsFromProjectTask(item, {
        columnName: column?.name,
        projectId: item.board_id,
        taskKey: `TASK-${item.id.slice(0, 6).toUpperCase()}`,
      });
      const existing = catalog.get(item.id);
      catalog.set(
        item.id,
        existing
          ? {
              ...existing,
              projectId: incoming.projectId,
              boardId: incoming.boardId,
              columnId: incoming.columnId,
              title: incoming.title,
              description: incoming.description,
              status: incoming.status,
              priority: incoming.priority,
              assigneeIds: incoming.assigneeIds.length
                ? Array.from(
                    new Set([...incoming.assigneeIds, ...existing.assigneeIds]),
                  )
                : existing.assigneeIds,
              estimate:
                incoming.estimate ??
                (existing.estimate?.unit === "points"
                  ? existing.estimate
                  : undefined),
              startDate: incoming.startDate,
              dueDate: incoming.dueDate,
              archivedAt: incoming.archivedAt,
            }
          : incoming,
      );
    });
    return Array.from(catalog.values());
  }, [availableColumns, availableTasks, details.allTasks]);

  const importedComments = useMemo<TaskComment[]>(
    () =>
      initialComments.map((comment) => ({
        id: comment.id,
        taskId: comment.task_id,
        authorId: comment.user_id || "former-member",
        body: comment.comment,
        mentionIds: [],
        attachmentIds: [],
        reactions: {},
        createdAt: comment.created_at,
      })),
    [initialComments],
  );

  useEffect(() => {
    setMobilePanel(details.preferences.detailsPanel);
  }, [details.preferences.detailsPanel]);
  useEffect(() => {
    if (!detailsHydrated || !task || !importedComments.length) return;
    const signature = importedComments
      .map((comment) => comment.id)
      .sort()
      .join("|");
    if (importedCommentsRef.current === signature) return;
    importedCommentsRef.current = signature;
    dispatchTask({
      type: "seed_comments",
      taskId: task.id,
      comments: importedComments,
    });
  }, [detailsHydrated, dispatchTask, importedComments, task]);
  const focusComment = useCallback(() => {
    setMobilePanel("activity");
    details.setDetailsPanel("activity");
    if (details.preferences.activityFilter === "history")
      details.setActivityFilter("comments");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => composerRef.current?.focus()),
    );
  }, [details]);
  const addChecklist = useCallback(() => {
    const count = task?.checklists.length || 0;
    details.addChecklist(count ? `Checklist ${count + 1}` : "Checklist");
    setMobilePanel("details");
    details.setDetailsPanel("details");
    requestAnimationFrame(() =>
      checklistRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }, [details, task?.checklists.length]);
  const openAttachments = useCallback(() => {
    setMobilePanel("details");
    details.setDetailsPanel("details");
    attachmentsRef.current
      ?.querySelector<HTMLInputElement>('input[type="file"]')
      ?.click();
    requestAnimationFrame(() =>
      attachmentsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }, [details]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".task-workspace")) return;
      if (busy) return;
      const typing = Boolean(
        target?.closest("input,textarea,select,[contenteditable=true]"),
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        focusComment();
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setMobilePanel("details");
        details.setDetailsPanel("details");
        setTitleEditSignal((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, details, focusComment]);

  const hasUnsaved = titleDirty || descriptionDirty || commentDirty;
  const requestClose = useCallback(() => {
    if (busy) return;
    if (hasUnsaved && !confirm("Discard the unsaved task edits?")) return;
    onClose();
  }, [busy, hasUnsaved, onClose]);

  if (!details.hydrated || !task)
    return <LoadingDialog onClose={requestClose} />;

  const accept = (outcome: TaskActionOutcome, label: string) => {
    if (outcome.ok) return true;
    toast({
      title: `${label} was not saved`,
      description: outcome.error.message,
      type: "error",
    });
    return false;
  };
  const syncBoard = async (
    name: string,
    label: string,
    local: () => TaskActionOutcome,
    remote: () => Promise<unknown>,
  ) => {
    setBusy(name);
    try {
      const outcome = local();
      if (!outcome.ok) {
        accept(outcome, label);
        return false;
      }
      try {
        await remote();
      } catch (cause) {
        let rolledBack = true;
        if (outcome.result.changed) {
          const expectedVersion = outcome.result.state.tasks[task.id]?.version;
          const rollback =
            expectedVersion === undefined
              ? undefined
              : details.dispatch({
                  type: "rollback_shared_task",
                  taskId: task.id,
                  snapshot: task,
                  expectedVersion,
                  activityId: outcome.result.activityId,
                });
          rolledBack = Boolean(rollback?.ok);
        }
        toast({
          title: `${label} was not saved`,
          description: rolledBack
            ? `The shared board rejected the update, so the change was reverted: ${errorMessage(cause)}`
            : `The shared board rejected the update and the task changed again before it could be reverted. Refresh before retrying.`,
          type: "error",
        });
        return false;
      }
      return true;
    } finally {
      setBusy(null);
    }
  };
  const copyLink = async () => {
    const url = `${window.location.origin}/projects?board=${encodeURIComponent(task.boardId)}&task=${encodeURIComponent(task.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Task link copied", type: "success" });
    } catch {
      toast({ title: "Could not copy link", description: url, type: "error" });
    }
  };
  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            task,
            comments: details.comments,
            activity: details.activity,
            attachments: details.attachments,
            dependencies: details.dependencies,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${task.key}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const changeStatus = (columnId: string) => {
    const column = columns.find((item) => item.id === columnId);
    if (!column) return;
    void syncBoard(
      "status",
      "Status",
      () => details.updateStatus(statusFromColumn(column.name), column.id),
      () => onUpdate({ taskId: task.id, columnId: column.id }),
    );
  };
  const changePriority = (priority: TaskPriority) => {
    void syncBoard(
      "priority",
      "Priority",
      () => details.updatePriority(priority),
      () => onUpdate({ taskId: task.id, priority }),
    );
  };
  const changeAssignee = async (memberId: string, selected: boolean) => {
    const nextIds = selected
      ? task.assigneeIds.filter((id) => id !== memberId)
      : Array.from(new Set([...task.assigneeIds, memberId]));
    await syncBoard(
      "assignee",
      "Assignee",
      () =>
        selected
          ? details.unassignMember(memberId)
          : details.assignMember(memberId),
      () => onUpdate({ taskId: task.id, assigneeId: nextIds[0] || null }),
    );
  };
  const changeParent = (parentId?: string) => {
    if (parentId && !details.allTasks.some((item) => item.id === parentId)) {
      const candidate = taskCatalog.find((item) => item.id === parentId);
      if (candidate) {
        const seeded = details.dispatch({ type: "seed_task", task: candidate });
        if (!accept(seeded, "Task hierarchy")) return;
      }
    }
    const outcome = details.setParent(parentId);
    if (accept(outcome, "Task hierarchy"))
      toast({
        title: parentId
          ? "Task converted to subtask"
          : "Task converted to parent",
        description: "Hierarchy is stored in the local task workspace.",
      });
  };
  const handleAttachments = async (files: File[]) => {
    const added: TaskAttachment[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const storageKey = createAttachmentStorageKey(task.id, id);
      const stored = await addAttachmentBlob(storageKey, file, {
        rejectDuplicate: true,
        duplicateScopePrefix: createAttachmentTaskStoragePrefix(task.id),
      });
      const attachment: TaskAttachment = {
        id,
        taskId: task.id,
        name: stored.name,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey,
        uploadedBy: actorId,
        createdAt: stored.createdAt,
      };
      const outcome = details.addAttachmentMetadata(attachment);
      if (!outcome.ok) {
        await deleteAttachmentBlob(storageKey);
        throw outcome.error;
      }
      added.push(attachment);
    }
    return added;
  };
  const removeAttachment = async (attachment: TaskAttachment) => {
    const outcome = details.removeAttachment(attachment.id);
    if (!outcome.ok) throw outcome.error;
    const deleted = await deleteAttachmentBlob(attachment.storageKey);
    if (!deleted)
      toast({
        title: "Attachment removed",
        description: "Its binary file was already unavailable in this browser.",
      });
  };
  const addComment = async (
    body: string,
    parentId?: string,
    mentionIds?: string[],
    attachmentIds?: string[],
  ) => {
    if (parentId) {
      const outcome = details.addComment(
        body,
        parentId,
        mentionIds,
        attachmentIds,
      );
      if (!accept(outcome, "Reply"))
        throw outcome.ok ? new Error("Reply was not saved.") : outcome.error;
      return;
    }
    let saved: ProjectTaskComment;
    try {
      saved = await onAddComment({ taskId: task.id, comment: body });
    } catch (cause) {
      const local = details.addComment(
        body,
        undefined,
        mentionIds,
        attachmentIds,
      );
      if (!accept(local, "Comment")) throw cause;
      toast({
        title: "Comment saved locally",
        description: "The shared discussion could not be updated.",
        type: "error",
      });
      return;
    }
    const outcome = details.addComment(
      body,
      undefined,
      mentionIds,
      attachmentIds,
      {
        id: saved.id,
        authorId: saved.user_id || actorId,
        createdAt: saved.created_at,
      },
    );
    if (!accept(outcome, "Comment"))
      throw outcome.ok ? new Error("Comment was not saved.") : outcome.error;
  };
  const duplicate = async () => {
    setBusy("duplicate");
    try {
      const newTaskId = crypto.randomUUID();
      const copy = await onDuplicate(projectTask, newTaskId);
      const outcome = details.duplicateTask({ newTaskId: copy.id });
      if (!accept(outcome, "Duplicate")) {
        try {
          await onDelete(copy.id);
        } catch {
          toast({
            title: "Duplicate needs cleanup",
            description:
              "The shared copy was created, but its local task metadata could not be saved. Delete the copy from the board before retrying.",
            type: "error",
          });
        }
        return;
      }
      toast({
        title: "Task duplicated",
        description: `Created “${copy.title}” with task metadata.`,
        type: "success",
      });
    } catch (cause) {
      toast({
        title: "Could not duplicate task",
        description: errorMessage(cause),
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };
  const moveToBoard = async (boardId: string) => {
    if (!confirm("Move this task to the destination project?")) return;
    setBusy("move");
    try {
      const moved = await onMove({
        taskId: task.id,
        destinationBoardId: boardId,
      });
      const destinationColumnName = availableColumns.find(
        (column) => column.id === moved.column_id,
      )?.name;
      const outcome = details.moveTask({
        boardId: moved.board_id,
        projectId: moved.board_id,
        columnId: moved.column_id,
        status: statusFromColumn(destinationColumnName || "To Do"),
      });
      if (!accept(outcome, "Move")) return;
      toast({ title: "Task moved", type: "success" });
      onClose();
    } catch (cause) {
      toast({
        title: "Task was not moved",
        description: errorMessage(cause),
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };
  const archive = async () => {
    if (
      !confirm(
        "Archive this task? You can preserve its history without keeping it on the active board.",
      )
    )
      return;
    setBusy("archive");
    try {
      const at = new Date().toISOString();
      await onUpdate({ taskId: task.id, archivedAt: at });
      const outcome = details.archiveTask();
      if (!accept(outcome, "Archive")) {
        await onUpdate({ taskId: task.id, archivedAt: null });
        return;
      }
      toast({ title: "Task archived", type: "success" });
      onClose();
    } catch (cause) {
      toast({
        title: "Task was not archived",
        description: errorMessage(cause),
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };
  const moveToTrash = async () => {
    if (
      !confirm(
        "Move this task to trash? It can be restored until it is permanently deleted.",
      )
    )
      return;
    setBusy("delete");
    try {
      const at = new Date().toISOString();
      await onUpdate({ taskId: task.id, archivedAt: at });
      const outcome = details.deleteTask();
      if (!accept(outcome, "Delete")) {
        await onUpdate({ taskId: task.id, archivedAt: null });
        return;
      }
      toast({
        title: "Task moved to trash",
        description: "Use Trash & recovery from any task menu to restore it.",
        type: "success",
      });
      onClose();
    } catch (cause) {
      toast({
        title: "Task was not deleted",
        description: errorMessage(cause),
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };
  const restoreTrash = async (entry: TaskTrashEntry) => {
    try {
      await onUpdate({ taskId: entry.task.id, archivedAt: null });
      const outcome = details.restoreFromTrash(entry.id);
      if (!accept(outcome, "Restore")) {
        await onUpdate({ taskId: entry.task.id, archivedAt: entry.deletedAt });
        return;
      }
      toast({ title: "Task restored", type: "success" });
    } catch (cause) {
      toast({
        title: "Task was not restored",
        description: errorMessage(cause),
        type: "error",
      });
    }
  };
  const restoreArchived = async (archivedTask: TaskDetails) => {
    try {
      await onUpdate({ taskId: archivedTask.id, archivedAt: null });
      const outcome = details.dispatch({
        type: "restore_task",
        taskId: archivedTask.id,
      });
      if (!accept(outcome, "Restore")) {
        await onUpdate({
          taskId: archivedTask.id,
          archivedAt: archivedTask.archivedAt || new Date().toISOString(),
        });
        return;
      }
      toast({ title: "Archived task restored", type: "success" });
    } catch (cause) {
      toast({
        title: "Task was not restored",
        description: errorMessage(cause),
        type: "error",
      });
    }
  };
  const permanentlyDelete = async (entry: TaskTrashEntry) => {
    try {
      await onDelete(entry.task.id);
      await Promise.allSettled(
        entry.attachments.map((attachment) =>
          deleteAttachmentBlob(attachment.storageKey),
        ),
      );
      if (entry.task.cover?.type === "image")
        await deleteTaskCoverImage(entry.task.id, entry.task.cover).catch(
          () => false,
        );
      const outcome = details.permanentlyDelete(entry.id);
      if (!accept(outcome, "Permanent delete")) return;
      toast({ title: "Task permanently deleted", type: "success" });
    } catch (cause) {
      toast({
        title: "Task was not permanently deleted",
        description: errorMessage(cause),
        type: "error",
      });
    }
  };
  const selectPanel = (panel: "details" | "activity") => {
    setMobilePanel(panel);
    details.setDetailsPanel(panel);
  };

  const fullscreen = details.preferences.isFullscreen;
  const watching = task.watcherIds.includes(actorId);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <div
          className={`pointer-events-none fixed inset-0 z-[51] flex items-center justify-center ${fullscreen ? "p-0" : "p-0 md:p-4"}`}
        >
          <Dialog.Content
            aria-busy={Boolean(busy)}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
            aria-describedby={undefined}
            className={`task-workspace pointer-events-auto relative flex w-full flex-col overflow-hidden bg-white text-[var(--foreground)] shadow-2xl outline-none transition-[opacity,transform] duration-200 ease-out data-[state=closed]:pointer-events-none data-[state=closed]:scale-[.985] data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100 dark:bg-[#181B1F] ${fullscreen ? "h-dvh max-h-none max-w-none rounded-none" : "h-dvh max-h-none max-w-none rounded-none md:h-[88vh] md:max-h-[850px] md:max-w-5xl md:rounded-2xl"}`}
          >
            <Dialog.Title className="sr-only">{task.title}</Dialog.Title>
            <header className="task-command-bar flex h-14 shrink-0 items-center gap-1.5 border-b border-[var(--ui-border)] bg-[var(--surface-raised)] px-2 sm:gap-3 sm:px-5">
              <nav
                aria-label="Task breadcrumb"
                className="hidden min-w-0 flex-1 items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] sm:flex"
              >
                <a
                  href="/dashboard"
                  className="truncate hover:text-[var(--foreground)]"
                >
                  Workspace
                </a>
                <span>/</span>
                <a
                  href={`/projects?board=${encodeURIComponent(task.boardId)}`}
                  className="truncate hover:text-[var(--foreground)]"
                >
                  {currentBoard?.name || "Project"}
                </a>
                <span>/</span>
                <span className="truncate">
                  {currentColumn?.name || "Board"}
                </span>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="shrink-0 font-semibold text-[var(--foreground)] hover:text-[var(--primary)]"
                >
                  {task.key}
                </button>
              </nav>
              <div className="min-w-0 flex-1 truncate text-[11px] font-semibold sm:hidden">
                {task.key}
              </div>
              <label className="relative w-[7.25rem] shrink-0 sm:w-auto">
                <span className="sr-only">Workflow status</span>
                <span
                  className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                  style={{ background: STATUS_META[task.status].color }}
                />
                <select
                  value={task.columnId}
                  onChange={(event) => changeStatus(event.target.value)}
                  disabled={Boolean(busy)}
                  className="h-9 w-full appearance-none truncate rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] pl-7 pr-6 text-[11px] font-semibold outline-none focus:border-[var(--primary)] sm:w-auto sm:max-w-48"
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                />
              </label>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="hidden min-[360px]:contents">
                  <IconButton
                    label="Copy task link"
                    onClick={() => void copyLink()}
                  >
                    <Link2 size={15} />
                  </IconButton>
                </span>
                <IconButton
                  label={watching ? "Stop watching task" : "Watch task"}
                  onClick={() => {
                    const outcome = details.toggleWatch(actorId);
                    if (accept(outcome, "Watch preference"))
                      toast({
                        title: watching
                          ? "No longer watching"
                          : "Watching task",
                        description:
                          "Saved as a local subscription preference.",
                      });
                  }}
                >
                  {watching ? <Bell size={15} /> : <BellOff size={15} />}
                </IconButton>
                <span className="hidden sm:contents">
                  <IconButton
                    label={fullscreen ? "Exit fullscreen" : "Open fullscreen"}
                    onClick={() => details.setFullscreen(!fullscreen)}
                  >
                    {fullscreen ? (
                      <Minimize2 size={15} />
                    ) : (
                      <Maximize2 size={15} />
                    )}
                  </IconButton>
                </span>
                <TaskActionsMenu
                  task={task}
                  tasks={taskCatalog}
                  boards={boards}
                  trash={details.trash}
                  archivedTasks={details.allTasks.filter((item) =>
                    Boolean(item.archivedAt),
                  )}
                  busy={busy}
                  onDuplicate={() => void duplicate()}
                  onSetParent={changeParent}
                  onMove={(boardId) => void moveToBoard(boardId)}
                  onExport={exportJson}
                  onPrint={() => window.print()}
                  onArchive={() => void archive()}
                  onDelete={() => void moveToTrash()}
                  onRestoreTrash={(entry) => void restoreTrash(entry)}
                  onRestoreArchived={(archivedTask) =>
                    void restoreArchived(archivedTask)
                  }
                  onPermanentDelete={(entry) => void permanentlyDelete(entry)}
                />
                <IconButton
                  label="Close task"
                  onClick={requestClose}
                  disabled={Boolean(busy)}
                >
                  <X size={18} />
                </IconButton>
              </div>
            </header>
            {(details.persistenceError || details.mutationError) && (
              <div
                role="alert"
                className="flex shrink-0 items-center justify-between bg-red-500/10 px-4 py-2 text-xs text-[var(--danger)]"
              >
                <span>
                  {details.persistenceError?.message ||
                    details.mutationError?.message}
                </span>
                <button
                  type="button"
                  onClick={details.clearError}
                  className="rounded p-1 hover:bg-red-500/10"
                  aria-label="Dismiss error"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <div
              role="tablist"
              aria-label="Task workspace sections"
              className="grid shrink-0 grid-cols-2 border-b border-[var(--ui-border)] bg-[var(--surface-raised)] md:hidden"
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  const panel =
                    mobilePanel === "details" ? "activity" : "details";
                  selectPanel(panel);
                  requestAnimationFrame(() =>
                    document.getElementById(`task-${panel}-tab`)?.focus(),
                  );
                }
              }}
            >
              <button
                id="task-details-tab"
                role="tab"
                aria-selected={mobilePanel === "details"}
                aria-controls="task-details-panel"
                tabIndex={mobilePanel === "details" ? 0 : -1}
                type="button"
                onClick={() => selectPanel("details")}
                className={`h-10 text-xs font-semibold ${mobilePanel === "details" ? "border-b-2 border-[var(--primary)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
              >
                Details
              </button>
              <button
                id="task-activity-tab"
                role="tab"
                aria-selected={mobilePanel === "activity"}
                aria-controls="task-activity-panel"
                tabIndex={mobilePanel === "activity" ? 0 : -1}
                type="button"
                onClick={() => selectPanel("activity")}
                className={`h-10 text-xs font-semibold ${mobilePanel === "activity" ? "border-b-2 border-[var(--primary)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
              >
                Activity ({details.comments.length + details.activity.length})
              </button>
            </div>
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
              <main
                id="task-details-panel"
                role="tabpanel"
                aria-labelledby="task-details-tab"
                className={`${mobilePanel === "activity" ? "hidden md:block" : "block"} custom-scrollbar min-h-0 min-w-0 overscroll-contain overflow-y-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:col-span-7 md:p-6 lg:col-span-8`}
              >
                <div className="mx-auto max-w-3xl space-y-6">
                  <TaskCover
                    taskId={task.id}
                    cover={task.cover}
                    onChange={details.setCover}
                  />
                  <TaskTitleEditor
                    title={task.title}
                    editSignal={titleEditSignal}
                    onDirtyChange={setTitleDirty}
                    onSave={(title) =>
                      syncBoard(
                        "title",
                        "Title",
                        () => details.updateTitle(title),
                        () => onUpdate({ taskId: task.id, title }),
                      )
                    }
                  />
                  <TaskQuickActions
                    task={task}
                    members={members}
                    labels={details.labels}
                    allLabels={details.allLabels}
                    allTasks={taskCatalog}
                    dependencies={details.dependencies}
                    onAssignee={changeAssignee}
                    onCreateLabel={details.createLabel}
                    onAddLabel={details.addLabel}
                    onRemoveLabel={details.removeLabel}
                    onUpdateLabel={details.updateLabel}
                    onDeleteLabel={details.deleteLabel}
                    onDates={(startDate, dueDate, reminder) =>
                      syncBoard(
                        "dates",
                        "Dates",
                        () =>
                          details.setDates({
                            startDate: startDate || undefined,
                            dueDate: dueDate || undefined,
                            reminder,
                          }),
                        () =>
                          onUpdate({
                            taskId: task.id,
                            startDate: startDate || null,
                            dueDate: dueDate || null,
                          }),
                      )
                    }
                    onPriority={changePriority}
                    onEstimate={(estimate) => {
                      void syncBoard(
                        "estimate",
                        "Estimate",
                        () => details.setEstimate(estimate),
                        () =>
                          onUpdate({
                            taskId: task.id,
                            estimatedHours:
                              estimate?.unit === "hours"
                                ? estimate.value
                                : null,
                          }),
                      );
                    }}
                    onChecklist={addChecklist}
                    onAttachment={openAttachments}
                    onDependency={(targetId, relation) => {
                      const candidate = taskCatalog.find(
                        (item) => item.id === targetId,
                      );
                      if (
                        candidate &&
                        !details.allTasks.some((item) => item.id === targetId)
                      )
                        details.dispatch({
                          type: "seed_task",
                          task: candidate,
                        });
                      const outcome = details.addDependency(targetId, relation);
                      accept(outcome, "Dependency");
                    }}
                  />
                  <TaskProperties
                    task={task}
                    members={members}
                    labels={details.labels}
                  />
                  <TaskDescriptionEditor
                    value={task.description}
                    members={members}
                    onDirtyChange={setDescriptionDirty}
                    onSave={(description) =>
                      syncBoard(
                        "description",
                        "Description",
                        () => details.updateDescription(description),
                        () => onUpdate({ taskId: task.id, description }),
                      )
                    }
                  />
                  <div ref={checklistRef}>
                    <ChecklistSection
                      checklists={task.checklists}
                      members={members}
                      actions={{
                        addChecklist: (title) => {
                          details.addChecklist(title);
                        },
                        renameChecklist: (id, title) => {
                          details.renameChecklist(id, title);
                        },
                        deleteChecklist: (id) => {
                          details.deleteChecklist(id);
                        },
                        toggleHideCompleted: (id) => {
                          details.toggleChecklistVisibility(id);
                        },
                        reorderChecklists: (ids) => {
                          details.reorderChecklists(ids);
                        },
                        addItem: (id, text) => {
                          details.addChecklistItem(id, text);
                        },
                        updateItem: (checklistId, itemId, patch) => {
                          details.updateChecklistItem(checklistId, itemId, {
                            ...patch,
                            assigneeId: patch.assigneeId ?? null,
                            dueDate: patch.dueDate ?? null,
                          });
                        },
                        deleteItem: (checklistId, itemId) => {
                          details.deleteChecklistItem(checklistId, itemId);
                        },
                        reorderItems: (checklistId, ids) => {
                          details.reorderChecklistItems(checklistId, ids);
                        },
                      }}
                    />
                  </div>
                  <div ref={attachmentsRef}>
                    <AttachmentSection
                      attachments={details.attachments}
                      onUpload={async (files) => {
                        await handleAttachments(files);
                      }}
                      onRemove={removeAttachment}
                    />
                  </div>
                  <LinkedWork
                    taskId={task.id}
                    dependencies={details.dependencies}
                    tasks={taskCatalog}
                    onRemove={(id) => {
                      const outcome = details.removeDependency(id);
                      accept(outcome, "Dependency");
                    }}
                  />
                </div>
              </main>
              <div
                id="task-activity-panel"
                role="tabpanel"
                aria-labelledby="task-activity-tab"
                className={`${mobilePanel === "details" ? "hidden md:flex" : "flex"} h-full min-h-0 min-w-0 overflow-hidden bg-slate-50/50 pb-[env(safe-area-inset-bottom)] dark:bg-[#14171A] md:col-span-5 md:border-l md:border-[var(--ui-border)] lg:col-span-4`}
              >
                <ActivityPanel
                  comments={details.comments}
                  activity={details.activity}
                  attachments={details.attachments}
                  members={members}
                  currentUserId={actorId}
                  filter={details.preferences.activityFilter}
                  composerRef={composerRef}
                  onDraftStateChange={setCommentDirty}
                  onUploadFiles={handleAttachments}
                  actions={{
                    setFilter: (filter) => {
                      details.setActivityFilter(filter);
                    },
                    addComment,
                    updateComment: (id, body) => {
                      const outcome = details.updateComment(id, body);
                      accept(outcome, "Comment");
                    },
                    deleteComment: (id) => {
                      const outcome = details.deleteComment(id);
                      accept(outcome, "Comment");
                    },
                    toggleReaction: (id, emoji) => {
                      const outcome = details.toggleReaction(
                        id,
                        emoji,
                        actorId,
                      );
                      accept(outcome, "Reaction");
                    },
                  }}
                />
              </div>
            </div>
            {busy && (
              <>
                <div
                  className="absolute inset-0 z-30 cursor-wait"
                  aria-hidden="true"
                />
                <div
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute bottom-[max(.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-slate-950/90 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg"
                >
                  <Loader2 size={12} className="animate-spin" />
                  Saving {busy}…
                </div>
              </>
            )}
            <TaskCommandPalette
              open={commandOpen}
              onOpenChange={setCommandOpen}
              task={task}
              columns={columns}
              members={members}
              onStatus={changeStatus}
              onPriority={changePriority}
              onAssignee={(id, selected) => {
                void changeAssignee(id, selected);
              }}
              onChecklist={addChecklist}
              onAttachment={openAttachments}
              onComment={focusComment}
              onCopyLink={() => void copyLink()}
              onArchive={() => void archive()}
            />
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LoadingDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] grid h-52 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[var(--surface)] shadow-2xl">
          <Dialog.Title className="sr-only">Loading task</Dialog.Title>
          <div className="text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Preparing task workspace…
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}
function statusFromColumn(name: string): TaskStatus {
  const value = name.toLowerCase();
  if (/done|complete|closed/.test(value)) return "done";
  if (/review|qa|test/.test(value)) return "in_review";
  if (/progress|doing|active/.test(value)) return "in_progress";
  if (/backlog|icebox/.test(value)) return "backlog";
  return "todo";
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Please try again.";
}
