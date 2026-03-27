import { Draggable } from '@hello-pangea/dnd'

const STATUS_DOT = {
  New:             'bg-gray-400',
  InProgress:      'bg-indigo-500',
  WaitingParts:    'bg-amber-400',
  WaitingCustomer: 'bg-orange-400',
  Ready:           'bg-emerald-500',
  Closed:          'bg-gray-300 dark:bg-gray-600',
}

function dueDateInfo(ymd) {
  if (!ymd) return null
  try {
    const due = new Date(ymd)
    const diffDays = Math.ceil((due - Date.now()) / 86400000)
    const label = due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    if (diffDays < 0)  return { label: `En retard · ${label}`, cls: 'text-red-500 dark:text-red-400', dot: 'bg-red-500' }
    if (diffDays <= 2) return { label, cls: 'text-amber-500 dark:text-amber-400', dot: 'bg-amber-400' }
    return { label, cls: 'text-gray-400 dark:text-neutral-500', dot: 'bg-gray-300 dark:bg-neutral-600' }
  } catch { return null }
}

export default function TicketCard({ ticket, onOpen, index }) {
  const urgent = ticket.priority === 'Urgent'
  const due = dueDateInfo(ticket.dueDate)
  const dot = urgent ? 'bg-red-500' : (STATUS_DOT[ticket.status] || 'bg-gray-300')

  return (
    <Draggable draggableId={ticket.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onOpen(ticket)}
          className={[
            'group relative rounded-xl border cursor-pointer transition-all select-none',
            'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md',
            'dark:bg-neutral-800/60 dark:border-neutral-700/60 dark:hover:border-neutral-600 dark:hover:bg-neutral-800',
            snapshot.isDragging ? 'shadow-xl rotate-1 scale-[1.02]' : 'shadow-sm',
          ].join(' ')}
        >
          {/* Left accent bar */}
          <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${dot}`} />

          <div className="p-3 pl-4">
            {/* Top row: ticket # + urgent badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-semibold text-gray-400 dark:text-neutral-500">
                #{ticket.ticketNumber || ticket.id.slice(0, 6)}
              </span>
              {urgent && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                                 bg-red-50 text-red-600 border border-red-200
                                 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                  ⚡ Urgent
                </span>
              )}
            </div>

            {/* Customer + bike */}
            <p className="text-sm font-medium text-gray-900 dark:text-neutral-100 leading-snug">
              {ticket.customerName || 'Client inconnu'}
            </p>
            {ticket.bikeType && (
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                {ticket.bikeType}{ticket.bikeBrand ? ` · ${ticket.bikeBrand}` : ''}
              </p>
            )}

            {/* Issue description */}
            {ticket.issueDescription && (
              <p className="text-xs text-gray-400 dark:text-neutral-500 line-clamp-2 mt-2 leading-relaxed">
                {ticket.issueDescription}
              </p>
            )}

            {/* Footer: créé par + due date */}
            {(ticket.createdByName || due) && (
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-neutral-700/50">
                {ticket.createdByName ? (
                  <span className="text-[11px] font-medium text-gray-400 dark:text-neutral-500 truncate">
                    {ticket.createdByName}
                  </span>
                ) : <span />}
                {due && (
                  <div className={`flex items-center gap-1 text-[11px] font-medium shrink-0 ${due.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${due.dot}`} />
                    {due.label}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}
