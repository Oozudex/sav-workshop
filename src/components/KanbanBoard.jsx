import TicketCard from './TicketCard'
import Column from './Column'
import { Droppable } from '@hello-pangea/dnd'
import { STATUSES, STATUS_LABELS } from '../lib/constants'

export default function KanbanBoard({ tickets, onOpen }) {
  const grouped = STATUSES.reduce((acc, s) => ({ ...acc, [s]: [] }), {})
  tickets.forEach(t => {
    const s = STATUSES.includes(t.status) ? t.status : 'New'
    grouped[s].push(t)
  })

  const ts = (x) => x?.updatedAt?.seconds ? x.updatedAt.seconds * 1000
    : (x?.updatedAt ? Date.parse(x.updatedAt) : 0)
  STATUSES.forEach(status => {
    grouped[status].sort((a, b) => {
      const pa = a.priority === 'Urgent' ? 1 : 0
      const pb = b.priority === 'Urgent' ? 1 : 0
      if (pb - pa !== 0) return pb - pa
      return ts(b) - ts(a)
    })
  })

  return (
    <div className="h-full w-full flex gap-4 overflow-x-auto pr-1">
      {STATUSES.map(status => (
        <Droppable droppableId={status} key={status}>
          {(provided, snapshot) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="h-full flex-1 flex">
              <Column
                title={STATUS_LABELS[status]}
                status={status}
                count={grouped[status].length}
                isActive={snapshot.isDraggingOver}
              >
                {grouped[status].map((t, index) => (
                  <TicketCard key={t.id} ticket={t} index={index} onOpen={onOpen} />
                ))}
                {provided.placeholder}
              </Column>
            </div>
          )}
        </Droppable>
      ))}
    </div>
  )
}
