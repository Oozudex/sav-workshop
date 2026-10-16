// Explication des calculs du taux de sortie (point info, comme « Comment est calculé le budget adapté ? »),
// avec des exemples et les chiffres du tableau affiché (total N et N-1, filtres compris).
import { classement, indicateurs } from '../../lib/sorties'
import { RANG_CLS, RangNuancier, rangStyle, rangTexte } from './rang'

const eur = v => `${Math.round(v).toLocaleString('fr-FR')} €`
const qte = v => Math.round(v).toLocaleString('fr-FR')
const pct = v => (v == null ? '—' : `${(Math.round(v * 1000) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} %`)
const signe = (d, unit) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${(Math.round(Math.abs(d) * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} ${unit}`
const evolPct = (v, r) => (r ? signe((v - r) / Math.abs(r) * 100, '%') : '—')
const evolPt = (v, r) => (v != null && r != null ? signe((v - r) * 100, 'pt') : '—')

const UP = 'text-emerald-700 dark:text-emerald-300'
const DOWN = 'text-red-700 dark:text-red-300'

function ExTable({ head, rows, foot }) {
  return (
    <div className="overflow-x-auto">
      <table className="my-1.5 min-w-[22rem] text-[11px] bg-white dark:bg-neutral-900 rounded-lg overflow-hidden">
        <thead><tr>{head.map((h, i) => <th key={i} className={`px-2 py-1 font-semibold text-gray-500 dark:text-neutral-400 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-neutral-800">
              {r.map((c, j) => <td key={j} className={`px-2 py-1 tabular-nums ${j ? 'text-right' : 'font-medium text-gray-900 dark:text-white'} ${j === r.length - 1 ? 'font-semibold text-teal-700 dark:text-teal-300' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot><tr className="border-t border-gray-200 dark:border-neutral-700">{foot.map((c, j) => <td key={j} className={`px-2 py-1 font-semibold tabular-nums ${j ? 'text-right' : ''} ${j === foot.length - 1 ? 'text-teal-700 dark:text-teal-300' : ''}`}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  )
}

// Exemples calculés avec la même fonction que le tableau : [CANet, MtMrg, QtRecep, QtVte, QtStkFin]
const ex = (caNet, mtMrg, qtVte, qtStkFin) => indicateurs([caNet, mtMrg, 0, qtVte, qtStkFin])
const REFS = [['Réf. A', 30, 70], ['Réf. B', 45, 5], ['Réf. C', 0, 20], ['Réf. D', 12, 0]]
const LAVAL = ex(600, 228, 2, 8), SARAN = ex(5400, 1944, 90, 10), GROUPE = ex(6000, 2172, 92, 18)
// Exemple du classement : taux de sortie N-1 et N de 5 magasins
const MAGS = [['SARAN', 0.62, 0.72], ['VITRE', 0.66, 0.70], ['CHECY', 0.70, 0.66], ['ST BERTHEVIN', 0.55, 0.64], ['CHATEAU GONTIER', 0.58, 0.60]]
const MAGS_RANG = classement(MAGS.map(m => m[2]))
// Même exemple pour la marge % (N-1, N) : classement indépendant de celui du taux
const MARGES = [0.370, 0.352, 0.372, 0.368, 0.330, 0.360, 0.385, 0.371, 0.392, 0.384]
const MARGES_RANG = classement(MAGS.map((_, i) => MARGES[i * 2 + 1]))

const Rang = ({ rk }) => <span className={`px-1.5 py-0.5 rounded font-semibold ${RANG_CLS}`} style={rangStyle(rk.t)}>{rangTexte(rk)}</span>

// total : { n, n1 } sommes du tableau affiché (pivot.total)
export default function SortieInfo({ total, labelN, labelN1, filtre }) {
  const n = total?.n ? indicateurs(total.n) : null
  const r = total?.n1 ? indicateurs(total.n1) : null
  const hasN = n && (n.caNet || n.qtVte || n.qtStkFin)
  const hasR = r && (r.caNet || r.qtVte || r.qtStkFin)
  const ici = filtre ? 'Ici (total du tableau, filtres compris)' : 'Ici (total du tableau)'
  const H = 'font-semibold text-gray-900 dark:text-white'
  return (
    <details className="rounded-xl border px-4 py-2.5 text-xs leading-relaxed border-teal-200 bg-teal-50/50 dark:border-teal-500/30 dark:bg-teal-500/5 text-gray-700 dark:text-neutral-300">
      <summary className="cursor-pointer font-semibold text-teal-700 dark:text-teal-300">ⓘ Comment sont calculés la marge, le taux de sortie, les couleurs et le classement ?</summary>
      <div className="mt-3 space-y-4 max-w-3xl">
        <p>
          Le fichier importé donne, pour chaque <strong>magasin × référence × couleur</strong>, cinq chiffres : <strong>CANet</strong> (chiffre d’affaires TTC),
          <strong> MtMrg</strong> (marge en €), <strong>QtRecep</strong> (pièces reçues), <strong>QtVte</strong> (pièces vendues) et <strong>QtStkFin</strong> (pièces
          en stock à la fin). Ces colonnes sont affichées telles quelles. L’application calcule à partir d’elles la marge %, le taux de sortie,
          la comparaison avec N-1 et le classement des lignes entre elles.
        </p>

        <section>
          <p className={H}>1. Le CA HT : on retire la TVA</p>
          <p>CANet est TTC. La marge doit se comparer à un chiffre d’affaires hors taxes : <strong>CA HT = CANet ÷ 1,20</strong> (TVA à 20 %).</p>
          <p className="mt-1">Exemple : CANet 1 200 € → CA HT = 1 200 ÷ 1,20 = <strong>1 000 €</strong>.</p>
          {hasN && <p className="mt-1"><strong>{ici} :</strong> CANet {eur(n.caNet)} → CA HT {eur(n.caHt)} en {labelN}.</p>}
        </section>

        <section>
          <p className={H}>2. La marge % : ce que rapporte chaque euro vendu</p>
          <p><strong>Marge % = MtMrg ÷ CA HT.</strong></p>
          <ExTable head={['Exemple', 'CANet', 'CA HT', 'MtMrg', 'Marge %']}
            rows={[['Une référence', '1 200 €', '1 000 €', '380 €', pct(380 / 1000)]]} />
          <p>Sur 1 000 € vendus hors taxes, il reste 380 € de marge, soit 38 %.</p>
          {hasN && <p className="mt-1"><strong>{ici} :</strong> {eur(n.mtMrg)} ÷ {eur(n.caHt)} = <strong>{pct(n.marge)}</strong> en {labelN}{hasR && <> (contre {pct(r.marge)} en {labelN1})</>}.</p>}
        </section>

        <section>
          <p className={H}>3. Le taux de sortie : la part du stock qui est partie</p>
          <p>
            <strong>Taux de sortie = QtVte ÷ (QtVte + QtStkFin).</strong> On regarde tout ce qu’on avait (ce qui a été vendu + ce qui reste en stock)
            et on calcule la part qui a été vendue. Le résultat va de 0 % (rien vendu) à 100 % (tout vendu, plus de stock).
          </p>
          <ExTable head={['Exemple', 'QtVte', 'QtStkFin', 'Avait (vendu + stock)', 'Taux de sortie']}
            rows={REFS.map(([l, v, s]) => [l, qte(v), qte(s), qte(v + s), pct(ex(0, 0, v, s).taux)])} />
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Réf. A : sur 100 pièces, 30 sont parties → 30 %. Il en reste beaucoup.</li>
            <li>Réf. B : 45 vendues sur 50 → 90 %. Elle part bien ; attention à la rupture.</li>
            <li>Réf. C : rien vendu, 20 en stock → 0 %.</li>
            <li>Réf. D : tout est vendu → 100 %. Sans vente ni stock, la case affiche « — ».</li>
          </ul>
          <p className="mt-1">QtRecep (les réceptions) est affiché pour information mais n’entre pas dans le calcul.</p>
          {hasN && <p className="mt-1"><strong>{ici} :</strong> {qte(n.qtVte)} ÷ ({qte(n.qtVte)} + {qte(n.qtStkFin)}) = <strong>{pct(n.taux)}</strong> en {labelN}{hasR && <> (contre {pct(r.taux)} en {labelN1})</>}.</p>}
        </section>

        <section>
          <p className={H}>4. Sur une ligne regroupée, on additionne puis on recalcule</p>
          <p>
            Une ligne « Magasin », « Marque » ou le total additionne les <strong>montants et les quantités</strong> de toutes ses références,
            puis recalcule la marge % et le taux de sortie sur ces sommes. On ne fait <strong>pas la moyenne des %</strong> : sinon un petit magasin
            ou une petite référence pèserait autant qu’un gros.
          </p>
          <ExTable head={['Exemple · une marque', 'QtVte', 'QtStkFin', 'Marge %', 'Taux de sortie']}
            rows={[
              ['LAVAL', '2', '8', pct(LAVAL.marge), pct(LAVAL.taux)],
              ['SARAN', '90', '10', pct(SARAN.marge), pct(SARAN.taux)],
            ]}
            foot={['Total groupe', '92', '18', pct(GROUPE.marge), pct(GROUPE.taux)]} />
          <p>
            Le taux du groupe est 92 ÷ (92 + 18) = {pct(GROUPE.taux)}, et non la moyenne (20 % + 90 %) ÷ 2 = 55 % : SARAN a beaucoup plus de pièces, il compte plus.
          </p>
        </section>

        <section>
          <p className={H}>5. La comparaison avec N-1 : vert ▲ ou rouge ▼</p>
          <p>
            N-1 est <strong>la même semaine de l’année précédente</strong> ({labelN1} pour {labelN}). Chaque case N est comparée à la case N-1 de la même ligne :
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><span className={`font-semibold ${UP}`}>▲ vert</span> si N est au-dessus de N-1, <span className={`font-semibold ${DOWN}`}>▼ rouge</span> s’il est en dessous.</li>
            <li>Seulement sur <strong>CANet, MtMrg, Marge %, QtVte et Taux de sortie</strong>, où une hausse est une bonne nouvelle.</li>
            <li><strong>QtRecep et QtStkFin restent sans couleur</strong> : recevoir ou stocker plus n’est ni bien ni mal en soi.</li>
            <li>Pas de couleur si N ou N-1 vaut 0 ou est vide, ni pour un écart minuscule (moins de 0,05 %).</li>
            <li>Sur la <strong>marge %</strong> et le <strong>taux de sortie</strong>, le fond sert au classement (étape 6) : l’évolution n’y est donnée que par la flèche ▲ / ▼ colorée.</li>
          </ul>
          <p className="mt-1">En survolant une case colorée, on voit la valeur N-1 et l’écart :</p>
          <ExTable head={['Exemple', 'N-1', 'N', 'Écart affiché']}
            rows={[
              ['CANet', '100 000 €', '112 000 €', '+12,0 % (montant : écart en %)'],
              ['Marge %', '38,5 %', '37,6 %', '−0,9 pt (pourcentage : écart en points)'],
            ]} />
          <p>
            Pour un pourcentage, l’écart est en <strong>points</strong> : passer de 38,5 % à 37,6 % fait −0,9 point (et non −2,3 %).
          </p>
          {hasN && hasR && (
            <p className="mt-1">
              <strong>{ici} :</strong> CANet {eur(r.caNet)} → {eur(n.caNet)} ({evolPct(n.caNet, r.caNet)}), marge {pct(r.marge)} → {pct(n.marge)} ({evolPt(n.marge, r.marge)}),
              taux de sortie {pct(r.taux)} → {pct(n.taux)} ({evolPt(n.taux, r.taux)}).
            </p>
          )}
        </section>

        <section>
          <p className={H}>6. Le classement de la marge % et du taux de sortie : du bleu à l’orange</p>
          <p>
            Progresser par rapport à N-1 ne suffit pas : un magasin qui gagne 2 points mais dont le taux reste en dessous de tous les autres
            est quand même le moins bon. Le fond des cases <strong>Marge %</strong> et <strong>Taux de sortie</strong> classe donc les lignes <strong>entre elles</strong>, au même
            niveau (les magasins entre eux, les marques d’un magasin entre elles…), <strong>sans regarder N-1</strong>. Chaque colonne a son
            propre classement : un magasin peut être bleu en marge et orange en taux de sortie.
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">1er : bleu foncé</span> <RangNuancier /> <span className="font-semibold">dernier : orange foncé</span>
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              <strong>Une nuance par place</strong> : avec 10 magasins, il y a 10 nuances, du bleu foncé (1er) au jaune (milieu du classement) puis à
              l’orange foncé (10e). Deux lignes n’ont la même couleur que si elles sont ex æquo : le 9e et le 10e ont deux oranges différents.
            </li>
            <li>Plus il y a de lignes (ex. 40 marques), plus les nuances voisines sont proches ; la place exacte s’affiche au survol.</li>
            <li>
              La nuance dépend de la <strong>place</strong>, pas de l’écart : le premier est toujours bleu foncé et le dernier orange foncé, même si les
              valeurs sont proches. N et N-1 sont classés chacun de leur côté. Le total n’est pas classé.
            </li>
          </ul>
          <ExTable head={['Exemple · 5 magasins', 'Taux N-1', 'Taux N', 'Évolution', 'Classement N']}
            rows={MAGS.map(([m, a, b], i) => [
              m, pct(a), pct(b),
              <span key="e" className={`font-semibold ${b > a ? UP : DOWN}`}>{b > a ? '▲' : '▼'} {evolPt(b, a)}</span>,
              <Rang key="r" rk={MAGS_RANG[i]} />,
            ])} />
          <p>
            CHATEAU GONTIER progresse (▲ vert, +2 points) mais a le plus faible taux de la semaine : il est en orange foncé. À l’inverse, CHECY
            recule (▼ rouge) mais reste dans la moyenne (jaune).
          </p>
          <p className="mt-2">
            <strong>La marge % se classe de la même façon, dans sa propre colonne</strong> : la plus forte marge en bleu foncé, la plus faible en
            orange foncé. Les mêmes 5 magasins :
          </p>
          <ExTable head={['Exemple · 5 magasins', 'Marge N-1', 'Marge N', 'Évolution', 'Classement marge N', 'Classement taux N']}
            rows={MAGS.map(([m], i) => {
              const a = MARGES[i * 2], b = MARGES[i * 2 + 1]
              return [
                m, pct(a), pct(b),
                <span key="e" className={`font-semibold ${b > a ? UP : DOWN}`}>{b > a ? '▲' : '▼'} {evolPt(b, a)}</span>,
                <Rang key="r" rk={MARGES_RANG[i]} />,
                <Rang key="t" rk={MAGS_RANG[i]} />,
              ]
            })} />
          <ul className="list-disc pl-4 space-y-0.5">
            <li>CHECY gagne 3 points de marge (▲ vert), la plus forte hausse, mais reste 4e sur 5 : orange clair.</li>
            <li>
              Les deux classements se lisent ensemble : SARAN est 1er en taux de sortie mais dernier en marge (ses produits partent bien, mais
              rapportent moins : promotions, remises ?). CHATEAU GONTIER est l’inverse : la meilleure marge, mais le stock part le moins vite.
            </li>
            <li>Un magasin bleu dans les deux colonnes vend vite <strong>et</strong> bien ; orange dans les deux, c’est lui qu’il faut regarder en premier.</li>
          </ul>
          <p className="mt-1">Survole une case de marge ou de taux pour lire sa place (« 3e sur 10 »).</p>
        </section>

        <section>
          <p className={H}>À retenir</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Les filtres changent le total : il ne compte que les lignes filtrées.</li>
            <li>
              <strong>Chrono</strong> (code article Intersport, ex. 0-163546) est un axe comme les autres : filtre et niveau de lignes. Dans la
              recherche d’un filtre, colle une colonne de codes copiée d’Excel (ou sépare-les par des virgules) pour les retrouver tous d’un coup.
            </li>
            <li>
              Avec un niveau <strong>Modèle, Référence, Chrono ou Couleur</strong> dans les lignes, une colonne <strong>Der Recep</strong> donne la dernière
              réception de chaque ligne (la plus récente des lignes regroupées) et son ancienneté à la fin de la semaine. En ambre : reçu il y a
              moins de 4 semaines, un taux de sortie bas peut venir de là (le stock a eu peu de temps pour sortir).
            </li>
            <li>
              Le filtre <strong>Der Recep</strong> garde les lignes dont la dernière réception tombe dans la période choisie (du … au …) ;
              le N-1 prend la même période un an plus tôt (du 01/09/2026 au 30/09/2026 → du 01/09/2025 au 30/09/2025). Une ligne sans date est écartée.
            </li>
            <li>
              Les filtres se limitent les uns les autres : avec l’univers TEXTILE HOMME coché, la liste Segment ne propose que les segments du
              textile homme (et de même pour familles, marques, couleurs…) ; une marque cochée limite aussi les univers et les magasins.
              Une valeur cochée qui ne correspond plus aux autres filtres reste en haut de sa liste, en gris : décoche-la si elle ne sert plus.
            </li>
            <li>
              Le graphique sous le tableau suit la saison semaine par semaine (par défaut Automne-Hiver dès la S23 et Printemps-Été dès la S49 ; réglable avec l’engrenage de la page Statistiques Achats),
              comparée aux mêmes semaines de l’année précédente. Il reprend en direct les filtres du tableau (sauf modèle, référence, couleur et Der Recep, trop détaillés pour toute une saison).
            </li>
            <li>La ligne de total en bas du fichier Excel est ignorée à l’import ; l’application refait ses propres totaux.</li>
            <li>Les magasins sont rapprochés de la liste des budgets : « INTERSPORT LAVAL » devient « LAVAL ».</li>
            <li>Réimporter une semaine remplace ses lignes ; tout se recalcule aussitôt.</li>
          </ul>
        </section>
      </div>
    </details>
  )
}
