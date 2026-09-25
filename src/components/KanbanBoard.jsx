import { useState } from 'react'
import TicketCard, { CARD_CLASS, STATUS_DOT, TicketCardBody } from './TicketCard'
import Column from './Column'
import { Droppable } from '@hello-pangea/dnd'
import { STATUSES, STATUS_LABELS } from '../lib/constants'

export default function KanbanBoard({ tickets, onOpen }) {
  const [mobileStatus, setMobileStatus] = useState(null)
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

  // Téléphone : une liste par statut (le glisser-déposer reste sur ordinateur).
  // Par défaut, le premier statut en cours qui contient des tickets.
  const current = mobileStatus || STATUSES.find(s => s !== 'Closed' && grouped[s].length) || 'New'

  return (
    <>
    <div className="md:hidden space-y-3">
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Statut">
        {STATUSES.map(s => (
          <button key={s} role="tab" aria-selected={current === s} onClick={() => setMobileStatus(s)}
            className={['h-8 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold transition-colors',
              current === s
                ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-black'
                : 'bg-white text-gray-600 border-gray-200 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700'].join(' ')}>
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
            {STATUS_LABELS[s]}
            <span className={current === s ? 'opacity-70' : 'text-gray-400 dark:text-neutral-500'}>{grouped[s].length}</span>
          </button>
        ))}
      </div>
      {current === 'Closed' && (
        <p className="text-[11px] leading-snug text-gray-400 dark:text-neutral-500">
          Affichés 14 jours, puis les données du client sont effacées : le ticket ne sert plus qu'aux statistiques.
        </p>
      )}
      {grouped[current].length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center border-gray-300 dark:border-neutral-700">
          <p className="text-xs text-gray-400 dark:text-neutral-500">Aucun ticket « {STATUS_LABELS[current]} »</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped[current].map(t => (
            <button key={t.id} type="button" onClick={() => onOpen(t)} className={`${CARD_CLASS} shadow-sm w-full text-left block`}>
              <TicketCardBody ticket={t} />
            </button>
          ))}
        </div>
      )}
    </div>

    <div className="hidden md:flex h-full w-full gap-4 overflow-x-auto pr-1">
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
    </>
  )
}
