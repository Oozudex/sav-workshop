# Fichiers des ILV

Tout ce qui sert à dessiner les ILV (étiquettes prix A4 paysage), lu par `src/lib/ilvPdf.js`.

## Logos des marques : `logos/marques/`

Un PNG par marque, **fond transparent**, recadré au plus près du logo.
Nom du fichier : la marque telle qu'elle est écrite dans la base de données, en minuscules,
sans accents, espaces remplacés par des tirets :

| Marque dans la base | Fichier |
|---|---|
| NAKAMURA | `nakamura.png` |
| ROCK MACHINE | `rock-machine.png` |
| Q BIKES | `q-bikes.png` |

Sans logo, l'ILV affiche le nom de la marque en toutes lettres à la place.

## Autres dossiers

- `badges/` : logos « PRIX PROMO », « BONS PLANS », « PRIX ENGAGÉ » et le slogan
  « Plus qu'un prix, c'est notre combat. » (fonds retirés, recolorés pour les panneaux rouge et bleu).
- `oney/` : logo Oney et pastilles 3x / 4x.
- `fonts/` : polices libres (licence SIL Open Font License) choisies et réglées pour ressembler aux
  polices Piivo : Saira (instances réglées en graisse et en largeur), Arimo (équivalent d'Arial),
  Roboto Condensed, Source Sans 3, Montserrat. Limitées aux caractères latins.
