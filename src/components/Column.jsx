const STATUS_COLOR = {
  New:            'bg-gray-400',
  InProgress:     'bg-indigo-500',
  WaitingParts:   'bg-amber-400',
  WaitingCustomer:'bg-orange-400',
  Ready:          'bg-emerald-500',
  Closed:         'bg-gray-300 dark:bg-gray-600',
}

export default function Column({ title, children, isActive = false, count = 0, status }) {
  const dot = STATUS_COLOR[status] || 'bg-gray-400'

  return (
    <div className={[
      'flex-1 min-w-[260px] sm:min-w-[280px] lg:min-w-[300px] max-w-[360px] h-full flex flex-col',
      'rounded-2xl border',
      'bg-white dark:bg-neutral-900',
      'border-gray-200 dark:border-neutral-800',
      isActive ? 'ring-2 ring-indigo-400/40 shadow-md' : 'shadow-sm',
    ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
          <span className="text-xs font-semibold text-gray-700 dark:text-neutral-200 tracking-wide uppercase">
            {title}
          </span>
        </div>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full
                         bg-gray-100 text-gray-400
                         dark:bg-neutral-800 dark:text-neutral-500">
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {count === 0 ? <EmptyState /> : children}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-8 text-center
                    border-gray-200 dark:border-neutral-700">
      <p className="text-xs text-gray-400 dark:text-neutral-600">Aucun ticket</p>
    </div>
  )
}
