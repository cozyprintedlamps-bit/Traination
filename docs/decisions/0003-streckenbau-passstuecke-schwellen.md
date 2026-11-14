# ADR 0003 – Streckenbau in der 3D-Ansicht, berechnete Passstücke, Schwellen und Bögen

Datum: 14.11.2026 · Status: angenommen (Schwellen, Bögen und Filament-Schätzung vorläufig, Testdruck offen)

## Kontext

Wünsche nach dem Ausbau:

- Die ganze Strecke zurücksetzen können.
- Realistischere Schienen mit weniger Material in der Mitte, um Filament zu sparen.
- Teile mit „+“ oder per Drag & Drop in das mittlere Fenster bauen.
- Den Plan schmaler und kleiner machen; er soll immer automatisch zoomen, ohne eigenes Zoomen und Verschieben.
- Rampen sparsamer machen.
- „Strecke schließen“ soll ein individuelles Stück berechnen, nicht nur Teile aus dem Katalog nehmen.
- Mehr Vorlagen.

## Entscheidungen

1. **Bauen in der 3D-Ansicht:**
   - An jedem freien Ende steht ein „+“. Es öffnet ein Menü mit allen Teilen, Kurven mit links und rechts. Bei leerer Strecke gibt es in der Mitte „Erstes Teil setzen“.
   - Teile der Liste lassen sich in die 3D-Ansicht oder den Plan ziehen. Ein Teil rastet am nächsten freien Ende ein: 110 px um den „+“ in 3D, 40 px im Plan. Sonst liegt es als neues loses Stück an der Stelle auf dem Bett.
   - Das „+“ in der Liste baut wie bisher am markierten Ende an.
2. **Plan als Übersichtskarte:**
   - 320 × 268 px unten rechts. Er passt sich immer an die ganze Strecke an; Zoomen und Verschieben der Ansicht gibt es nicht mehr.
   - Während man ein Stück oder Gebäude zieht, bleibt der Ausschnitt stehen.
   - Die 3D-Ansicht nutzt die volle Breite. Die Kamera richtet sich mit `setViewOffset` auf den Teil, den der Plan frei lässt.
3. **Strecke leeren:** Ein Knopf mit Rückfrage im Seitenfeld (kein Browser-Dialog). Gebäude und Züge bleiben; Strg+Z holt die Strecke zurück.
4. **Strecke schließen mit berechneten Passstücken** (`core/autoclose.ts`):
   - Kandidaten sind Routen aus Bögen und Geraden:
     - Bogen – Gerade – Bogen (wie Dubins-Pfade), mit allen Kombinationen aus den Radien der Standardkurven und weiteren Radien von 120 bis 3000 mm, links und rechts.
     - Ein einzelner Bogen mit genau dem nötigen Radius plus Gerade.
     - Die bisherige Route aus Standardkurven.
   - Bögen mit Standardradius bestehen aus Standardkurven plus höchstens einer Passkurve. Andere Radien werden in gleiche Passkurven geteilt, höchstens 90° je Stück.
   - Geraden bestehen aus Standardgeraden plus höchstens einer Passgerade.
   - Grenzen: Radius mindestens 90 mm, jedes Stück mindestens 20 mm lang, jedes Stück passt mit Zapfen auf das Druckbett des gewählten Druckers.
   - Kosten: Standardteil 1, Passstück 1,5, jede neue Passform zusätzlich 2,5. Engere Passkurven als R182 und lange Routen zählen etwas mehr. So gewinnen Standardteile, wo sie passen.
   - Die 40 günstigsten Routen werden gelegt. Genommen wird die erste, die genau am Ziel ankommt und keine andere Strecke überlappt.
   - Unterschiedliche Höhen schließt der Rechner weiterhin nicht. Dafür baut man erst Rampen an.
5. **Schwellen-Optik** (`settings.sleepers`, Standard an):
   - Zwischen den Rillen ist das Gleis zwischen Schwellen offen. Die Lücken sind 10 × 15 mm mit gerundeten Ecken, im Raster von 18 mm; neben jeder Rille bleiben 2 mm Wand.
   - Gilt bei Gerade, Kurve, Rampe, Brücke (Taschen auf dem Deck) und Prellbock.
   - Weichen, Kreuzungen und Adapter bleiben geschlossen.
   - 22 mm vor einer Buchse und 6 mm vor einem Zapfen gibt es keine Lücke.
6. **Bögen:**
   - Die Seitenwände der Rampen bekommen Viadukt-Bögen, die inneren Rippen je einen Bogen quer zum Gleis. Die Rippen stehen unter jeder zweiten Schwelle, damit die Bögen gleich breit werden und keine Lücke über einer Rippe liegt.
   - Brückenpfeiler und hohe Stützen bekommen Öffnungen. Weil Brücken kopfüber gedruckt werden, sind deren Öffnungen oben und unten spitz.
   - Alle Bögen enden oben in einer 45°-Spitze und drucken so ohne Stützmaterial.
7. **Filament-Schätzung** (`core/material.ts`):
   - Bisher: Volumen × 0,55. Jetzt so, wie ein Slicer druckt:
     - Seitenflächen × 0,84 mm (2 Wände).
     - Oberseiten × 1,0 mm, Unterseiten × 0,6 mm (Haut).
     - Der Rest des Volumens mit 15 % Füllung.
     - Höchstens das Volumen.
   - Damit zeigt die Übersicht ehrlich, was Öffnungen bringen. Vergleich mit dieser Schätzung:
     - Gerade 216 mm mit Schwellen: 41,5 → 40,7 g (−2 %).
     - Rampe 38 → 76 mm: 126,6 → 94,6 g (−25 %).
     - Rampe 0 → 38 mm: 70,9 → 65,0 g (−8 %).
     - Brücke: 65,0 → 57,2 g (−12 %).
     - Stütze 76 mm: 21,3 → 15,6 g (−27 %).
8. **Vorlagen:**
   - 11 Strecken: Oval, kleiner Kreis, großes Oval, Abstellgleis, Ausweiche, Rangierbahnhof, Acht, Mit Brücke, Acht mit Brücke, LEGO-Stadt, Leer.
   - Die Acht braucht eine Kreuzung mit 148 mm (`crossing-148`), damit ihre Schleifen genau mit Standardteilen schließen.
   - Die Ausweiche schließt ihre Lücken mit „Strecke schließen“.
   - Bahnhof und Signal stellt das Tool neben eine freie Gerade (`arrangeBuildings`). Wendet man eine Vorlage an, rücken Gebäude, die auf der neuen Strecke stünden, beiseite.
   - Dazu 4 Zug-Vorlagen: Güterzug, Personenzug, Schnellzug, E-Zug mit CyberBrick.

## Folgen

- Schwellen sparen kaum Filament. Bei 15 % Füllung ist das Innere der Schiene ohnehin fast leer, und jede Öffnung bekommt neue Wände. Sie sind eine Frage der Optik; wer volle Schienen will, schaltet sie im Schritt Elemente aus.
- Spürbar sparen Rampen, Brückenpfeiler und hohe Stützen: Ihre dünnen Wände werden voll gedruckt.
- Berechnete Passstücke sind eigene Elementtypen im Projekt. Die Stückliste und der Export führen sie wie andere Teile.
- Testdruck nötig:
  - Wand zwischen Rille und Schwellen-Lücke.
  - Spitzbögen.
  - Passkurven mit kleinen Winkeln.
