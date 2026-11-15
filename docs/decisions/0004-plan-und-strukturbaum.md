# ADR 0004 – Plan über die ganze rechte Seite mit Strukturbaum

Datum: 14.11.2026 · Status: angenommen

## Kontext

Der Plan war eine kleine Übersichtskarte (320 × 268 px) unten rechts. Wunsch: Der Plan soll größer werden und die ganze rechte Seite einnehmen. Darunter soll ein Strukturbaum alle Bauteile der Strecke zeigen. Dort sollen sich Teile auswählen, umfärben und löschen lassen. Ein Klick auf ein Teil markiert es im Plan blau.

## Entscheidungen

1. **Layout:**
   - Das Plan-Feld läuft von der Höhe der anderen Felder (76 px) bis zum unteren Rand und ist so breit wie das Seitenfeld links (404 px, 370 px unter 1400 px Fensterbreite; beide nutzen `--page-w`).
   - Oben steht der Plan, größer als die alte Karte (294 × 191 px). Erste Fassung mit 380 px Feldbreite, gemessen im Browser: Plan 354 × 229 px, die Zeichnung darin 246 × 181 px statt 205 × 151 px, also genau 20 % mehr. Mit der Breite des Seitenfelds ist der Plan 378 × 243 px.
   - Darunter steht der Strukturbaum mit **drei festen Kategorien**: „Bauteile (n)“, „Gebäude (n)“ und „Züge (n)“. Die Kopfzeilen sind immer zu sehen, auch bei 0 Einträgen und in allen Schritten mit Plan. Beim Start sind alle drei **eingeklappt**. Jede Kategorie klappt für sich auf und zu und hat dann eine eigene Liste, die scrollt; offene Kategorien teilen sich den Platz, die Kopfzeilen der anderen bleiben im Bild. Solange alle zu sind, füllt der Plan den freien Platz; ist eine offen, behält der Plan seine Größe. Der Zustand liegt im Store (`treeOpen` je Kategorie, `setTreeGroup`) und bleibt beim Wechsel der Schritte.
   - Die 3D-Ansicht behält die volle Breite. Die Kamera richtet sich auf den freien Teil. Dafür misst `App.tsx` die Breite des Feldes, statt eine Konstante zu führen.
   - Unter 1000 px Breite stapeln sich die Felder wie bisher.
2. **Aufbau des Baums** (`core/structure.ts`):
   - Der Baum zeigt die Hängestruktur des Plans (jedes Stück steckt an einem Elternstück). Eine Kette aus Stücken mit je einem Nachfolger bleibt auf einer Ebene, damit ein Kreis mit 40 Stücken keine 40 Ebenen tief wird. Nur hinter einer Verzweigung (Weiche) geht es eine Ebene tiefer.
   - Jede Zeile hat eine laufende Nummer, den Namen, links ein Farbfeld und rechts einen Mülleimer.
   - Gebäude stehen in einer eigenen Kategorie. Ihr Farbfeld ändert die Wandfarbe.
   - „Züge“ zeigt die Fahrzeuge des Zugs von vorn nach hinten. Das Farbfeld ändert die Farbe des Aufbaus, der Mülleimer entfernt das Fahrzeug.
   - Der Baum geht ohne Rekursion durch den Plan, auch bei sehr langen Ketten.
3. **Löschen:** Der Mülleimer macht dasselbe wie „Entfernen“ im Seitenfeld: Das Stück wird mit allem entfernt, was hinter ihm hängt. Der Tooltip nennt die Zahl der folgenden Teile (`followers`). Strg+Z holt alles zurück.
4. **Eigene Farbe je Stück** (`Piece.color`, optional):
   - Die Farbe gehörte bisher zur Bauart (`ElementType.color`). Ein Farbfeld an einem einzelnen Stück würde sonst alle Stücke dieser Bauart umfärben. Deshalb hat ein Stück jetzt optional eine eigene Farbe. Fehlt sie, gilt die Farbe der Bauart.
   - Die Farbe kommt aus der Bambu-Palette, wie bei den Fahrzeugen. Die Palette ist als `ColorPalette` aus dem Farbwähler herausgelöst.
   - Wird die Farbe der Bauart gewählt, entfällt die eigene Farbe. Im Baum setzt „Farbe der Bauart“ sie zurück.
   - Die Farbe gilt in Plan, 3D-Ansicht, Stückliste und Export. Gleiche Stücke in verschiedenen Farben sind getrennte Teile mit eigenem Filament (`partsList` zählt nach Farbe).
   - `.trproj` bleibt Schema 2: Das neue Feld ist optional, ältere Dateien laden unverändert. Eine ungültige Farbe wird beim Laden verworfen.
5. **Blaue Markierung:** Das gewählte Stück, Gebäude oder Fahrzeug bekommt im Plan eine halbtransparente blaue Fläche mit blauem Rand. Sie liegt in einer eigenen obersten Ebene, damit die Reihenfolge der Stücke im Plan gleich bleibt. Ein Klick im Plan wählt umgekehrt die Zeile im Baum und scrollt sie ins Bild. Fahrzeuge haben dafür eine eigene Auswahl `Selection.car`: `Selection.vehicle` ist immer gesetzt (die Seite „Züge“ bearbeitet es), würde also sonst immer das erste Fahrzeug blau färben. Es ist immer nur eines markiert: Wer ein Stück oder Gebäude wählt, nimmt die Markierung vom Fahrzeug; fällt das Fahrzeug weg, verschwindet sie ebenfalls.
6. **Züge im Plan:** Der Plan zeichnet den Zug so, wie die 3D-Ansicht ihn auf die Strecke stellt (`route` und `trainPoses`): ein Rechteck je Fahrzeug in der Farbe des Aufbaus, beim ersten Fahrzeug mit einer Spitze in Fahrtrichtung. Die Züge fangen keine Klicks ab, die Schienenstücke darunter bleiben wählbar und ziehbar.
7. **Bearbeiten nur im Schritt „Strecke“:** Wie das Ziehen im Plan sind Farbfeld und Mülleimer nur im Schritt „Strecke“ aktiv. In allen anderen Schritten wählt der Baum nur aus. In „Züge“ und „Design“ wählt ein Klick auf ein Fahrzeug im Baum zugleich das Fahrzeug, das die Seite bearbeitet.

## Offen

- Der Baum zeigt noch keine Warnungen (Überlappung, schwebende Stücke, falsche Verbinder) an den Zeilen.
- Ein einzelnes Stück aus der Mitte einer Kette entfernen, ohne die folgenden zu löschen, geht nicht: Die folgenden Stücke hängen an seiner Lage. Dafür müsste man sie zu losen Stücken mit fester Lage und Höhe machen.
