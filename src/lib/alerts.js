// Moteur des seuils d'alerte, commun aux tickets SAV et aux commandes clients.
// Fonctions pures : testées dans tests/unit/
//
// Un jeu de règles décrit :
//   { scope, settingsId, path, title, isOpen(item), rules: [...] }
// et chaque règle :
//   kind 'count'    : alerte si le nombre d'éléments mesurés dépasse le seuil
//   kind 'duration' : alerte si au moins un élément dépasse le seuil (en jours, via rule.age)

// Valeur actuelle d'une règle : { value, itemIds, max? }
export function measureRule(rule, items, threshold, now, isOpen) {
  const concerned = rule.measure(items.filter(isOpen), now)
  if (rule.kind === 'duration') {
    const over = concerned.filter(i => rule.age(i, now) > threshold)
    return { value: over.length, itemIds: over.map(i => i.id), max: Math.max(0, ...concerned.map(i => rule.age(i, now))) }
  }
  return { value: concerned.length, itemIds: concerned.map(i => i.id) }
}

export function isBreached(rule, measured, threshold) {
  return rule.kind === 'duration' ? measured.value > 0 : measured.value > threshold
}

// Alertes actives selon les réglages { [key]: { enabled, threshold } }
export function computeAlerts(items, settings, ruleSet, now = new Date()) {
  const alerts = []
  for (const rule of ruleSet.rules) {
    const conf = settings?.[rule.key]
    if (!conf?.enabled || !(conf.threshold >= 0)) continue
    const measured = measureRule(rule, items, conf.threshold, now, ruleSet.isOpen)
    if (isBreached(rule, measured, conf.threshold)) {
      alerts.push({
        key: rule.key, scope: ruleSet.scope, path: ruleSet.path, label: rule.label,
        message: rule.message(measured.value, conf.threshold),
        value: measured.value, threshold: conf.threshold, itemIds: measured.itemIds,
      })
    }
  }
  return alerts
}
