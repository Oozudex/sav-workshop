import TicketCard from './TicketCard'
import Column from './Column'
import { Droppable } from '@hello-pangea/dnd'

const ORDER = ['New', 'Diagnostic', 'WaitingParts', 'WaitingCustomer', 'InProgress', 'Ready', 'Closed']
const TITLES = {
  New: 'Nouveau',
  Diagnostic: 'Diagnostic',
  WaitingParts: 'En attente pièces',
  WaitingCustomer: 'En attente client',
  InProgress: 'En réparation',
  Ready: 'Prêt à rendre',
  Closed: 'Clôturé',
}

export default function KanbanBoard({ tickets, onOpen }) {
  const grouped = ORDER.reduce((acc, s) => ({ ...acc, [s]: [] }), {})
  tickets.forEach(t => {
    const s = ORDER.includes(t.status) ? t.status : 'New'
    grouped[s].push(t)
  })

  // Tri : urgents d’abord, puis updatedAt décroissant
  const ts = (x) => x?.updatedAt?.seconds ? x.updatedAt.seconds * 1000
    : (x?.updatedAt ? Date.parse(x.updatedAt) : 0)
  ORDER.forEach(status => {
    grouped[status].sort((a, b) => {
      const pa = a.priority === 'Urgent' ? 1 : 0
      const pb = b.priority === 'Urgent' ? 1 : 0
      if (pb - pa !== 0) return pb - pa
      return (ts(b) - ts(a))
    })
  })

  return (
    <div className="h-full w-full flex gap-4 overflow-x-auto pr-1">
      {ORDER.map(status => (
        <Droppable droppableId={status} key={status}>
          {(provided, snapshot) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="h-full flex-1 flex">
              <Column
                title={TITLES[status]}
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
