// Légende des champs obligatoires (RGAA 11.10) : à placer en haut des formulaires qui utilisent « * »
export default function RequiredHint({ className = '' }) {
  return (
    <p className={`text-[11px] text-gray-500 dark:text-neutral-400 ${className}`}>
      Les champs marqués d’un astérisque (*) sont obligatoires.
    </p>
  )
}
