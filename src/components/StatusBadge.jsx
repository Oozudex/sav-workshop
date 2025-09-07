const STYLES = {
  New: 'bg-gray-200 text-gray-800 dark:bg-gray-700/40 dark:text-gray-200',
  Diagnostic: 'bg-blue-200 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300',
  WaitingParts: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200',
  WaitingCustomer: 'bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200',
  InProgress: 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-300',
  Ready: 'bg-green-200 text-green-900 dark:bg-green-900/40 dark:text-green-300',
  Closed: 'bg-gray-300 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`text-xs px-2 py-1 rounded ${STYLES[status] || STYLES.New}`}>
      {{
        New: 'Nouveau',
        Diagnostic: 'Diagnostic',
        WaitingParts: 'En attente pièces',
        WaitingCustomer: 'En attente client',
        InProgress: 'En réparation',
        Ready: 'Prêt à rendre',
        Closed: 'Clôturé',
      }[status] || status}
    </span>
  )
}
