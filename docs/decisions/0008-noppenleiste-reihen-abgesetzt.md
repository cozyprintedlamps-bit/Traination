# ADR 0008 – Noppenleiste: bis 20 Reihen, auf Wunsch abgesetzt

Datum: 15.11.2026 · Status: angenommen (Plattendicke vorläufig)

## Kontext

Eine Noppenleiste hatte ein oder zwei Reihen und war als massive Platte so hoch wie das Gleis (12 mm). Mit mehr Reihen, etwa als Bauplatte neben dem Gleis, wäre das viel Filament. Gewünscht: Die Zahl der Reihen wählt man in einem Dropdown bis 20, und ein Haken „abgesetzt“ setzt die zusätzlichen Noppen tiefer.

## Entscheidungen

Grundlage ist das Modell aus ADR 0004: Jede Seite eines Stücks hat ihre eigene Noppenleiste (`StudLedge` mit Art und Reihenzahl, links und rechts getrennt).

1. **Reihen:** `LEDGE_ROWS_MAX` ist 20, für LEGO und für DUPLO (in ADR 0004 waren es 12 und 6, damit das Stück aufs Druckbett passt). Die Auswahl ist ein Dropdown (1 bis 20) je Seite. Eine breitere Leiste als das Bett zeigt die bestehende Warnung „zu groß fürs Druckbett“. Beim Laden wird die Reihenzahl auf 1 bis 20 begrenzt (ein gespeicherter Wert darüber wird 20), damit eine beschädigte Datei die Engine nicht lahmlegt.
2. **Abgesetzt** (`StudLedge.lowered`, je Seite):
   - Die erste Reihe neben dem Gleis bleibt so hoch wie das Gleis. Die Reihen dahinter stehen auf einer Platte, die so dick ist wie die Platte des Systems (`StudSystem.plate`: LEGO 3,2 mm, DUPLO 4,8 mm); ihre Noppen sitzen entsprechend tiefer.
   - Bei einer Reihe gibt es nichts abzusetzen: Der Haken ist dann aus und gesperrt, der Wert bleibt aber erhalten. Das Stück ist dann gleich dem nicht abgesetzten.
   - Die Platte überlappt die erste Reihe um 0,5 mm, damit beide Teile sicher verschmelzen. Auf Kurven läuft jede Reihe auf ihrem eigenen Bogen (ADR 0004), auch die abgesetzten.
3. **Vorgabe:** Schaltet man eine Seite von „keine“ auf LEGO oder DUPLO, beginnt sie mit **5 Reihen, abgesetzt** (`STUD_DEFAULT_ROWS`, `STUD_DEFAULT_LOWERED`). Beim Wechsel von LEGO auf DUPLO bleiben Reihen und Haken. Schaltet man aus und wieder ein, gelten die Vorgaben erneut.
4. **Zuordnung:** `lowered` gehört zur Leiste und damit zum Element. Ein abgesetztes Stück ist ein eigenes Druckteil (andere Bauart, andere Stückliste); der Cache-Schlüssel der Engine und die Vorschaubilder ändern sich mit dem Feld von selbst. `.trproj` bleibt Schema 3: Das Feld ist optional und fehlt, wenn es aus ist. Der Zwischenstand mit einem Haken je Element (`studLowered`) wird beim Laden gelesen.
5. **Ersparnis:** Bei LEGO-Noppen mit 4 Reihen auf einer Seite und 216 mm Länge fallen 3 × 8 mm × 8,8 mm × 216 mm Material weg (rund 46 cm³ weniger); der Test rechnet das nach.

## Offen

- „Ab Reihe 2“ und die Plattendicke des Systems sind Annahmen. Wer die abgesetzte Fläche größer will (z. B. auch Reihe 1 absetzen) oder eine andere Dicke, müsste das einstellbar machen.
- Sehr breite Leisten (20 Reihen DUPLO = 320 mm je Seite) passen auf keine Druckplatte.
- 20 Reihen LEGO auf beiden Seiten brauchen rund 1 s zum Berechnen (1080 Noppen).
