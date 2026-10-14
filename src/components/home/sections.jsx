// Cartes de l'accueil : outils (route, rôles autorisés, rayon de l'outil) et espaces qui regroupent
// les outils d'un rayon (carte « Vélo » des directeurs et acheteurs). Rangement : lib/homeLayout.js.

// group : rayon de l'outil (regroupé dans l'espace du rayon hors comptes rayon) ;
// lead : affiché juste après les espaces de rayon
export const SECTIONS = [
  {
    label: 'Réparation / SAV',
    group: 'velo',
    description: 'Gérer les tickets de réparation et le suivi atelier',
    path: '/tickets',
    roles: null,
    acheteurRayons: ['velo'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    color: 'indigo',
  },
  {
    label: 'Commandes',
    group: 'velo',
    description: 'Suivre les commandes clients : vélos, pièces et accessoires',
    path: '/orders',
    roles: ['velo', 'acheteur', 'directeurmag', 'directeurgen'],
    acheteurRayons: ['velo'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    color: 'emerald',
  },
  {
    label: 'Opérations Commerciales',
    description: 'Suivre les opérations et promotions en cours',
    path: '/operations',
    roles: null,
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    color: 'amber',
  },
  {
    label: 'Flocage',
    group: 'chaussure',
    description: 'Gérer les commandes de flocage et personnalisation',
    path: '/flocage',
    roles: ['chaussure', 'directeurmag', 'acheteur', 'directeurgen'],
    acheteurRayons: ['chaussure'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
    color: 'pink',
  },
  {
    label: 'Transferts',
    group: 'velo',
    description: 'Gérer les demandes de transfert de vélos entre magasins',
    path: '/transfert',
    roles: ['velo', 'acheteur', 'directeurmag', 'directeurgen'],
    acheteurRayons: ['velo'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    color: 'teal',
  },
  {
    label: 'Balises',
    group: 'velo',
    description: 'Voir quel magasin a quelle balise de diagnostic et la demander',
    path: '/balises',
    roles: ['velo', 'acheteur', 'directeurmag', 'directeurgen', 'admin'],
    acheteurRayons: ['velo'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6M9 11h6M12 15.5v.01M10 21v-2h4v2" />
      </svg>
    ),
    color: 'cyan',
  },
  {
    label: 'Google Drive',
    group: 'velo',
    description: 'Accéder aux documents et fichiers partagés du groupe',
    path: 'https://drive.google.com/drive/folders/19otRZlgj-yFXlQmi6UrxunALkCd0Oq6d?usp=drive_link',
    external: true,
    roles: ['velo', 'acheteur'],
    acheteurRayons: ['velo'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335" />
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    ),
    color: 'cyan',
  },
  {
    label: 'Commandes OBUT',
    group: 'velo',
    description: 'Gérer les commandes de boules de pétanque sur mesure',
    path: '/obut',
    roles: ['velo', 'directeurmag', 'acheteur', 'directeurgen'],
    acheteurRayons: ['velo'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    color: 'indigo',
  },
  {
    label: 'B2B',
    description: 'Accéder aux outils et plateformes partenaires',
    path: '/b2b',
    roles: null,
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
      </svg>
    ),
    color: 'blue',
  },
  {
    label: 'RH',
    description: 'Accéder aux outils de gestion des ressources humaines',
    path: '/rh',
    roles: null,
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    color: 'purple',
  },
  {
    label: 'Service',
    description: 'Accéder aux services partenaires et à leurs procédures',
    path: '/service',
    roles: null,
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    color: 'orange',
  },
  {
    label: 'Budgets',
    lead: true,
    description: 'Préparer les budgets d’achat par univers, segment, magasin et marque',
    path: '/budgets',
    roles: ['acheteur', 'directeurgen'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
      </svg>
    ),
    color: 'violet',
  },
  {
    label: 'Paramètres magasin',
    description: 'Gérer les employés et les informations de votre magasin',
    path: '/settings',
    roles: ['directeurmag', 'acheteur'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
      </svg>
    ),
    color: 'gray',
  },
  {
    label: 'Admin',
    description: 'Gérer les magasins, les équipes et les directeurs',
    path: '/settings',
    roles: ['directeurgen'],
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'gray',
  },
]

export const COLOR = {
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    icon: 'text-indigo-600 dark:text-indigo-400',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
    ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-500/30',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    icon: 'text-emerald-700 dark:text-emerald-400',
    btn: 'bg-emerald-700 hover:bg-emerald-800',
    ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    icon: 'text-amber-700 dark:text-amber-400',
    btn: 'bg-amber-700 hover:bg-amber-800',
    ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-400',
    btn: 'bg-blue-600 hover:bg-blue-700',
    ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    icon: 'text-violet-600 dark:text-violet-400',
    btn: 'bg-violet-600 hover:bg-violet-700',
    ring: 'hover:ring-violet-200 dark:hover:ring-violet-500/30',
  },
  pink: {
    bg: 'bg-pink-50 dark:bg-pink-500/10',
    icon: 'text-pink-700 dark:text-pink-400',
    btn: 'bg-pink-700 hover:bg-pink-800',
    ring: 'hover:ring-pink-200 dark:hover:ring-pink-500/30',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    icon: 'text-rose-600 dark:text-rose-400',
    btn: 'bg-rose-600 hover:bg-rose-700',
    ring: 'hover:ring-rose-200 dark:hover:ring-rose-500/30',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-500/10',
    icon: 'text-teal-700 dark:text-teal-400',
    btn: 'bg-teal-700 hover:bg-teal-800',
    ring: 'hover:ring-teal-200 dark:hover:ring-teal-500/30',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-500/10',
    icon: 'text-cyan-700 dark:text-cyan-400',
    btn: 'bg-cyan-700 hover:bg-cyan-800',
    ring: 'hover:ring-cyan-200 dark:hover:ring-cyan-500/30',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-500/10',
    icon: 'text-purple-600 dark:text-purple-400',
    btn: 'bg-purple-600 hover:bg-purple-700',
    ring: 'hover:ring-purple-200 dark:hover:ring-purple-500/30',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-500/10',
    icon: 'text-orange-700 dark:text-orange-400',
    btn: 'bg-orange-700 hover:bg-orange-800',
    ring: 'hover:ring-orange-200 dark:hover:ring-orange-500/30',
  },
  lime: {
    bg: 'bg-lime-50 dark:bg-lime-500/10',
    icon: 'text-lime-700 dark:text-lime-400',
    btn: 'bg-lime-700 hover:bg-lime-800',
    ring: 'hover:ring-lime-200 dark:hover:ring-lime-500/30',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-500/10',
    icon: 'text-sky-700 dark:text-sky-400',
    btn: 'bg-sky-700 hover:bg-sky-800',
    ring: 'hover:ring-sky-200 dark:hover:ring-sky-500/30',
  },
  gray: {
    bg: 'bg-gray-100 dark:bg-neutral-800',
    icon: 'text-gray-600 dark:text-neutral-300',
    btn: 'bg-gray-800 hover:bg-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600',
    ring: 'hover:ring-gray-200 dark:hover:ring-neutral-700',
  },
}

// Espaces de rayon : une carte qui ouvre la page /espace/:rayon avec les outils du rayon
export const GROUPS = {
  velo: {
    label: 'Vélo',
    description: 'Atelier SAV, commandes, transferts, OBUT et documents du rayon cycle',
    path: '/espace/velo',
    color: 'indigo',
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="5.5" cy="16.5" r="3.5" />
        <circle cx="18.5" cy="16.5" r="3.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 16.5L9 9h6.5l3 7.5M9 9l3 7.5h1.5L15.5 9M8 6.5h3M15.5 9l-1-3h2" />
      </svg>
    ),
  },
  chaussure: {
    label: 'Chaussure',
    description: 'Flocage et outils du rayon chaussure',
    path: '/espace/chaussure',
    color: 'pink',
    icon: (
      <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 15.75V9.5c0-.69.56-1.25 1.25-1.25H6.5c.69 0 1.25.56 1.25 1.25v.75c0 .83 1.34 1.5 3 1.5h.5l5.69 1.9A4.5 4.5 0 0120 17.62V18a.75.75 0 01-.75.75H4.5A1.5 1.5 0 013 17.25v-1.5zm0 0h17" />
      </svg>
    ),
  },
}
