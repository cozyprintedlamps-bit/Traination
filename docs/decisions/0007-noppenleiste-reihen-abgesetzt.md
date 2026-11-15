# ADR 0007 – Noppenleiste: bis 20 Reihen, auf Wunsch abgesetzt

Datum: 15.11.2026 · Status: angenommen (Plattendicke vorläufig)

## Kontext

Eine Noppenleiste hatte ein oder zwei Reihen und war als massive Platte so hoch wie das Gleis (12 mm). Mit mehr Reihen, etwa als Bauplatte neben dem Gleis, wäre das viel Filament. Gewünscht: Die Zahl der Reihen wählt man in einem Dropdown bis 20, und ein Haken „abgesetzt“ setzt die zusätzlichen Noppen tiefer.

## Entscheidungen

1. **Reihen:** `LEDGE_ROWS_MAX = 20` (zuerst 25, auf Wunsch gekürzt). Die Auswahl ist ein Dropdown (1 bis 20) statt Knöpfe. Beim Laden einer Datei wird `studRows` auf 1 bis 20 begrenzt (ein gespeicherter Wert über 20 wird auf 20 gesetzt), damit eine beschädigte Datei die Engine nicht lahmlegt.
2. **Abgesetzt** (`ElementType.studLowered`, Standard aus):
   - Die erste Reihe neben dem Gleis bleibt so hoch wie das Gleis. Die Reihen dahinter stehen auf einer Platte von 3 mm Dicke (`LEDGE_LOWERED_THICKNESS`); ihre Noppen sitzen entsprechend tiefer.
   - Bei einer Reihe gibt es nichts abzusetzen: Der Haken ist dann aus und gesperrt, der Wert bleibt aber erhalten. Das Stück ist dann gleich dem nicht abgesetzten.
   - Gilt auf beiden Seiten und bei Geraden, Kurven und Prellböcken gleich.
   - Die Platte überlappt die erste Reihe um 0,5 mm, damit beide Teile sicher verschmelzen. Die Leiste wird wie bisher nach den Rillen angefügt.
3. **Zuordnung:** `studLowered` gehört zum Element. Ein abgesetztes Stück ist ein eigenes Druckteil (andere Bauart, andere Stückliste), der Cache-Schlüssel der Engine und die Vorschaubilder ändern sich mit dem Feld von selbst.
4. **Ersparnis:** Bei LEGO-Noppen mit 4 Reihen auf einer Seite und 216 mm Länge fallen 3 × 8 mm × 9 mm × 216 mm Material weg (rund 46 cm³ weniger); der Test rechnet das nach.

## Offen

- Die Dicke von 3 mm und „ab Reihe 2“ sind Annahmen. Wer die Platte dünner oder die abgesetzte Fläche größer will (z. B. auch Reihe 1 absetzen), müsste die Dicke einstellbar machen.
- Sehr breite Leisten (20 Reihen DUPLO = 320 mm je Seite) passen auf keine Druckplatte; die Warnung „zu groß fürs Druckbett“ erscheint wie bisher.
- 20 Reihen LEGO auf beiden Seiten brauchen rund 1 s zum Berechnen (1080 Noppen).
