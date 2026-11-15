# ADR 0006 – Strecke planen in Reitern mit Vorschaubildern

Datum: 14.11.2026 · Status: angenommen

## Kontext

Die Seite „Strecke planen“ zeigte Vorlagen als Knöpfe mit Namen, Schienen als Liste mit kleinen Strichsymbolen und Gebäude als Kacheln mit Strichsymbolen. Gewünscht sind Vorschaubilder statt nur Namen und drei Reiter: Vorlagen, Schienen, Gebäude. Außerdem sollen in der Vorschau der Schritte „Design“ und „Züge“ die Schienen durchsichtig sein, und die Gestaltung eines Fahrzeugs gehört in den Schritt „Züge“.

## Entscheidungen

1. **Drei Reiter** (`TrackTab` im Store, Start: Vorlagen; der Reiter bleibt beim Wechsel der Schritte):
   - **Vorlagen:** eine Kachel je Vorlage mit Bild, zwei Spalten.
   - **Schienen:** eine Kachel je Element des Projekts mit Bild, drei Spalten. Gerade, Weichen und so weiter: ein Klick baut am markierten Ende an, die Kachel lässt sich in 3D-Ansicht und Plan ziehen. Kurven haben zwei Knöpfe, „links“ und „rechts“, jeder für sich ziehbar. Die Knöpfe brechen um, wenn sie nicht nebeneinander passen.
   - **Gebäude:** eine Kachel je Art (Bahnhof, Bahnsteig, Haus, Stellwerk, Wasserturm, Lokschuppen, Signal) mit Bild, darunter der Editor des gewählten Gebäudes.
   - Zustand, „Strecke schließen“, „Strecke leeren“ und „Ausgewähltes Stück“ stehen unter den Reitern und gelten für alle.
   - Ein Klick auf ein Gebäude im Plan oder im Baum öffnet den Reiter „Gebäude“, weil dort sein Editor steht.
2. **Vorschaubilder sind 3D-Bilder** (`ui/thumbnails.ts`, `previews.ts`, `Thumb.tsx`):
   - Eine kleine three.js-Ansicht, die nicht auf der Seite steht (`SceneView` mit `snapshot()`, ohne Gitter, doppelte Pixeldichte, PNG mit durchsichtigem Hintergrund), zeichnet jedes Bild einmal. Die Teile kommen aus derselben Engine wie die große 3D-Ansicht (`engine.element`, `engine.building`, `trackParts`).
   - Vorlagen werden mit den Elementen des Projekts gebaut, so wie „Anwenden“ sie legt (`withStandardElements`), also mit deren Farben und Stützen. Sie sind steiler von oben gesehen (`FROM_ABOVE`), damit man die Form liest. Passen die Elemente nicht zu einer Vorlage, gibt es kein Bild und die Kachel bleibt ohne.
   - Die Bilder werden erst gebaut, wenn eine Kachel erscheint, und nach einem Schlüssel aus den Parametern zwischengespeichert (höchstens 300). Ändert man ein Element oder seine Farbe, ändert sich der Schlüssel und das Bild wird neu gezeichnet. Bis ein Bild da ist, zeigt die Kachel einen Platzhalter, bei Schienen und Gebäuden das Strichsymbol. Ohne WebGL bleibt es dabei.
   - Gemessen im Browser: alle 11 Vorlagen nach rund 2,7 s, die 18 Schienen nach 0,8 s, die 7 Gebäude nach 0,3 s.
3. **Schienen durchsichtig in „Züge“ und „Design“:** Die Schienen unter dem Fahrzeug (und unter dem ganzen Zug) sind zu 78 % durchsichtig (`VEHICLE_RAIL_OPACITY = 0.22`), damit der Zug im Mittelpunkt steht. Das gilt in beiden Schritten für die Ansicht „Fahrzeug“ und „Ganzer Zug“; in Strecke, Elemente, Übersicht und Export bleiben sie fest. Seit ADR 0009 steht diese Ansicht im Fenster neben der Seite, die große 3D-Ansicht zeigt dann die unveränderte Strecke. Die 3D-Ansicht zählt ihre durchsichtigen Teile im Attribut `data-see-through`, das die Browser-Tests lesen.
4. **Gestaltung im Schritt „Züge“:** Die Abschnitte „Design“ (Fenster, Schornstein, Dom, Dach, Ladung, Höhe Aufbau) und „Gestaltung“ (Muster, Name/Nummer, Gesicht, Lampen, Puffer, Schienenräumer) stehen jetzt als Abschnitt „Design von …“ unter den Daten des gewählten Fahrzeugs (`VehicleLook`). Der Schritt „Design“ behält die Farben des gewählten Fahrzeugs („Hauptteile & Farben“, Teile getrennt drucken) sowie die Farben von Schienen und Gebäuden. Die Zugliste steht nicht mehr auf der Seite, sondern im Fenster daneben (ADR 0009); der Schalter „Fahrzeug / Ganzer Zug“ gilt in beiden Schritten.

## Offen

- Das Vorlagenbild zeigt Höhen nur in der Schrägsicht. Bei der Vorlage „Hügel“ sieht man die Rampen nur schwach.
- Die Zahl der Schienen-Kacheln wächst mit jedem berechneten Passstück („Strecke schließen“). Bei sehr vielen könnte man diese gruppieren.
