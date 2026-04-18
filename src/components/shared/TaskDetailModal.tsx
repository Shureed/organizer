import { useRef } from 'react'
import { useTaskDetail } from '../../hooks/useTaskDetail'
import {
  Dialog,
  DialogContent,
} from '../ui/dialog'
import { TaskDetailHeader } from '../task-detail/TaskDetailHeader'
import { TaskDetailFormGrid } from '../task-detail/TaskDetailFormGrid'
import { TaskDetailSubtasks } from '../task-detail/TaskDetailSubtasks'
import { TaskDetailRelated } from '../task-detail/TaskDetailRelated'
import { CommentSection } from './CommentSection'

interface TaskDetailModalProps {
  taskId: string | null
  onClose: () => void
}

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const commentsBottomRef = useRef<HTMLDivElement>(null)

  const {
    task,
    subtasks,
    comments,
    related,
    parentNode,
    loading,
    saving,
    error,
    ui,
    actions,
  } = useTaskDetail(taskId)

  const {
    status,
    date,
    priority,
    bucket,
    commentBody,
    submittingComment,
    relatedOpen,
    isDateSet,
    setStatus,
    setDate,
    setPriority,
    setBucket,
    setCommentBody,
    setRelatedOpen,
    setActiveTaskId,
  } = ui

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-lg w-full max-h-[85vh] overflow-y-auto overflow-x-hidden"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
      >
        <TaskDetailHeader taskId={taskId} />

        {error && (
          <p style={{ color: 'var(--red)' }} className="text-xs">{error}</p>
        )}

        {!loading && task && (
          <div className="flex flex-col gap-4 mt-1 min-w-0">
            {/* Parent node link */}
            {parentNode && (
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }} className="text-xs">
                  {parentNode.type === 'project' ? '↑ Project' : '↑ Parent'}
                </span>
                <button
                  onClick={() => setActiveTaskId(parentNode.id)}
                  style={{
                    backgroundColor: 'var(--surface2)',
                    color: 'var(--accent)',
                    border: '1px solid var(--border)',
                  }}
                  className="text-xs rounded-full px-2.5 py-0.5 hover:brightness-110 transition-all"
                >
                  {parentNode.name}
                </button>
              </div>
            )}

            {/* Form fields, update button */}
            <TaskDetailFormGrid
              status={status}
              date={date}
              priority={priority}
              bucket={bucket}
              isDateSet={isDateSet}
              saving={saving}
              onStatusChange={setStatus}
              onDateChange={setDate}
              onPriorityChange={setPriority}
              onBucketChange={setBucket}
              onUpdate={() => actions.handleUpdate(onClose)}
            />

            {/* PR Link */}
            {task.git_pr_url && (
              <div className="flex flex-col gap-1">
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Pull Request
                </p>
                <a
                  href={task.git_pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                  className="text-sm hover:underline"
                >
                  View PR
                </a>
              </div>
            )}

            {/* Body */}
            {task.body && (
              <div className="flex flex-col gap-1">
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Description
                </p>
                <p style={{ color: 'var(--text)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words rounded-lg px-3 py-2">
                  {task.body}
                </p>
              </div>
            )}

            {/* Subtasks */}
            <TaskDetailSubtasks
              subtasks={subtasks}
              onSelectSubtask={setActiveTaskId}
            />

            {/* Related Items */}
            <TaskDetailRelated
              related={related}
              isOpen={relatedOpen}
              onToggleOpen={setRelatedOpen}
              onSelectItem={setActiveTaskId}
            />

            {/* Comments */}
            <CommentSection
              comments={comments}
              value={commentBody}
              onChange={setCommentBody}
              onSubmit={() => actions.handleCommentSubmit(() => commentsBottomRef.current?.scrollIntoView())}
              submitting={submittingComment}
              bottomRef={commentsBottomRef}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
