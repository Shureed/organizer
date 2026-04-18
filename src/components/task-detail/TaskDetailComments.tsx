import { useRef } from 'react'
import { useTaskDetail } from '../../hooks/useTaskDetail'
import { CommentSection } from '../shared/CommentSection'

interface TaskDetailCommentsProps {
  taskId: string | null
}

export function TaskDetailComments({ taskId }: TaskDetailCommentsProps) {
  const commentsBottomRef = useRef<HTMLDivElement>(null)

  const {
    comments,
    ui: { commentBody, submittingComment, setCommentBody },
    actions: { handleCommentSubmit },
  } = useTaskDetail(taskId)

  return (
    <CommentSection
      comments={comments}
      value={commentBody}
      onChange={setCommentBody}
      onSubmit={() => handleCommentSubmit(() => commentsBottomRef.current?.scrollIntoView())}
      submitting={submittingComment}
      bottomRef={commentsBottomRef}
    />
  )
}
