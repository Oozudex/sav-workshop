import { STATUS_LABELS } from '../lib/constants'

const STYLES = {
  New:             'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  WaitingParts:    'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  WaitingCustomer: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  InProgress:      'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  Ready:           'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Closed:          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${STYLES[status] || STYLES.New}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}
