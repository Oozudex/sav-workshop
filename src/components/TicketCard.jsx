import StatusBadge from './StatusBadge'
import { Draggable } from '@hello-pangea/dnd'

const ACCENT = {
  New: 'bg-gray-300 dark:bg-gray-600',
  Diagnostic: 'bg-blue-400 dark:bg-blue-500',
  WaitingParts: 'bg-yellow-400 dark:bg-yellow-500',
  WaitingCustomer: 'bg-orange-400 dark:bg-orange-500',
  InProgress: 'bg-indigo-400 dark:bg-indigo-500',
  Ready: 'bg-green-500 dark:bg-green-500',
  Closed: 'bg-gray-400 dark:bg-gray-600',
}

export default function TicketCard({ ticket, onOpen, index }) {
  const customer = ticket.customerName?.trim()
  const bike = ticket.bikeType?.trim()
  const urgent = ticket.priority === 'Urgent'
  const accentClass = urgent ? 'bg-red-500' : (ACCENT[ticket.status] || 'bg-gray-300')

  return (
    <Draggable draggableId={ticket.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onOpen(ticket)}
          className="relative overflow-hidden rounded-2xl border ring-1 shadow-sm hover:shadow-md transition cursor-pointer
                     bg-white border-gray-200/70 ring-black/5
                     dark:bg-neutral-900 dark:border-neutral-800 dark:ring-white/5"
        >
          <div className={`absolute left-0 top-0 h-full w-1 ${accentClass}`} />
          <div className="p-3 pl-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="font-medium">#{ticket.ticketNumber || ticket.id}</div>
                {urgent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                    Urgent
                  </span>
                )}
              </div>
              <StatusBadge status={ticket.status} />
            </div>
            <div className="text-sm">
              {customer || 'Client inconnu'}{bike ? ` — ${bike}` : ''}
            </div>
            {ticket.issueDescription && (
              <div className="text-xs text-gray-500 dark:text-neutral-400 line-clamp-2 mt-1">
                {ticket.issueDescription}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}
