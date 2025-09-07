export default function Column({ title, children, isActive = false, count = 0 }) {
  return (
    <div
      className={[
        'flex-1 min-w-[260px] sm:min-w-[300px] lg:min-w-[340px] max-w-[400px] h-full flex flex-col',
        'rounded-3xl border bg-white shadow-sm ring-1 ring-black/5',
        'dark:bg-neutral-900 dark:border-neutral-800 dark:ring-white/5',
        isActive ? 'ring-2 ring-indigo-400/50 shadow-lg' : '',
      ].join(' ')}
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b rounded-t-3xl px-4 py-3
                        bg-gradient-to-r from-gray-50 to-white/90
                        dark:from-neutral-900 dark:to-neutral-900/90
                        border-gray-200 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-800 dark:text-neutral-100">{title}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-white shadow-sm
                             dark:bg-neutral-900 dark:border-neutral-700">
              {count}
            </span>
          </div>
        </div>
        <div className="p-3 space-y-3">
          {count === 0 ? <EmptyState /> : children}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed text-center text-sm py-8
                    bg-gray-50/60 text-gray-500
                    dark:bg-neutral-800/60 dark:text-neutral-400 dark:border-neutral-700">
      <div className="mb-1">Déposez un ticket ici</div>
      <div className="text-xs">ou créez-en un nouveau</div>
    </div>
  )
}
