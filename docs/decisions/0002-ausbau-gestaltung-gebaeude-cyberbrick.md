# ADR 0002 – Gestaltung, Gebäude, Noppen, Stützen und CyberBrick

Datum: 13.11.2026 · Status: angenommen (Werte für Noppen, CyberBrick und Stützen vorläufig)

## Kontext

Nach der ersten Version kamen diese Wünsche dazu:

- Fahrzeuge per Drag & Drop in den Zug ziehen.
- Schienen mit LEGO®- und DUPLO®-Noppen am Rand.
- Ein Knopf, der eine offene Strecke schließt.
- Züge künstlerisch gestalten.
- Unterkategorien für Loks, Güter-, Personen- und Sonderwagen.
- Hauptteile in eigener Farbe, getrennt gedruckt und zusammengesteckt.
- Eine Ansicht des ganzen Zuges.
- Automatische Stützen unter erhöhter Strecke.
- Eine Gesamtübersicht.
- Bahnhöfe und kleine Gebäude.
- Ein elektrischer Zug mit Bambu Lab CyberBrick.

## Entscheidungen

1. **Fahrzeuge in vier Kategorien** mit 21 Bauarten (`core/vehicle.ts`, `KINDS_BY_CATEGORY`):
   - Loks: Dampflok, Tenderlok, Diesellok, Rangierlok, E-Lok, Schnellzug, E-Lok mit CyberBrick
   - Güterwagen: Kasten-, Kühl-, Kessel-, Flach-, Holz-, Container- und Schüttgutwagen
   - Personenwagen: Personen-, Doppelstock- und Speisewagen
   - Sonderwagen: Tender, Kranwagen, Packwagen, Postwagen
2. **Sieben Farbbereiche je Fahrzeug:** Aufbau, Dach, Details, Ladung, Muster/Schrift, Fahrgestell, Räder. Ein Aufbau besteht aus der Hülle und farbigen „Abschnitten“ (`geometry/vehicle.ts`). Abschnitte mit flacher Unterseite (Dach, Schornstein, Dom, Ladung, Kran) haben eine Befestigung mit Zapfenplätzen.
   - **Getrennt drucken** (Standard): Diese Abschnitte werden eigene Druckteile auf Zapfen Ø 3 mm (Loch + 0,15 mm). Alles auf dem Dach (Stromabnehmer) geht mit dem Dach. Abschnitte ohne Befestigung (Lampen, Kappen) werden Teil des Aufbaus. Muster und Schrift werden 0,6 mm tief eingraviert.
   - **Mehrfarbig in einem Teil** (AMS): Alle Abschnitte sind Volumen im selben 3MF-Objekt. Muster und Schrift stehen 0,6 mm farbig hervor.
3. **Gestaltung:**
   - Muster: Streifen, Nieten, Punkte, Sterne, Herzen.
   - Name oder Nummer mit einer eigenen Strichschrift (`geometry/text.ts`, A–Z, 0–9, ohne Schriftdateien).
   - Gesicht, Lampen, Puffer, Schienenräumer (nur ohne vordere Kupplung).
   - Dachform rund, flach oder spitz; Schornstein hoch, niedrig, als Trichter oder ohne.
4. **Strecke schließen** (`core/autoclose.ts`): Die Route lautet Kurven – Gerade – Kurven – Gerade, gerechnet mit der Plan-Kurve. Die Geraden bestehen aus Standardstücken plus höchstens einem Passstück in genau der fehlenden Länge (mindestens 20 mm). Gesucht wird die Variante mit den wenigsten Teilen. Treffen zwei Zapfen oder zwei Buchsen aufeinander, sitzt ein Adapter direkt vor dem Zielende.
5. **Stützen** (`core/supports.ts`): Flache Strecke über dem Bett bekommt Stützen unter jedem Stoß und in der Mitte von Stücken über 150 mm. Rampen und Brücken stehen selbst. Stützen haben seitliche Lippen; bei Noppenleisten entfallen sie. Gleich hohe Stützen sind dasselbe Druckteil.
6. **Noppenleisten:** Eine Leiste neben dem Gleis mit LEGO- (Raster 8 mm, Ø 4,8 × 1,7) oder DUPLO-Noppen (Raster 16 mm, Ø 9,4 × 4,5, hohl), links, rechts oder beidseitig, anfangs ein oder zwei Reihen (jetzt bis 20, siehe ADR 0007). Es gibt sie nur bei Geraden, Kurven und Prellböcken. Ein Stück mit Noppen ist umgedreht nicht dasselbe Teil; die Stückliste trennt deshalb links und rechts.
7. **Gebäude** (`core/buildings.ts`, `geometry/buildings.ts`): Bahnhof, Bahnsteig, Haus, Stellwerk, Wasserturm, Lokschuppen und Signal. Sie werden im Plan frei gestellt und gezogen. Dächer sind eigene Druckteile auf Zapfen, Details farbige Volumen. Die Öffnung des Lokschuppens hat 45°-Schrägen, damit keine lange Brücke entsteht; sie begrenzt auch die Zughöhe.
8. **CyberBrick-Lok** (`presets/cyberbrick.ts`, `geometry/cyberbrick.ts`, Maße aus den offiziellen Datenblättern):
   - Der 030-Motor liegt in einem Schacht über der vorderen Achse.
   - Eine gedruckte Schnecke (Modul 1, eingängig) treibt ein schrägverzahntes Schneckenrad mit 15 Zähnen auf der Achse (15:1).
   - Die angetriebenen Räder haben Ø 26 mm, damit das Schneckenrad über der Schiene bleibt.
   - Im hohlen Aufbau: Akkuleisten, vier Säulen für die Empfänger-Platine, Öffnungen für Schalter und USB.
   - Die Vorschau zeigt den Aufbau durchsichtig mit Motor, Akku und Platinen.
9. **Schritte:** Strecke → Elemente → Züge → Design → Übersicht → Export. Die Übersicht schätzt das Filament je Farbe (Volumen × 1,24 g/cm³ × 0,55).
10. **Drag & Drop** mit HTML5: Kacheln der Palette und Wagen im Zug lassen sich ziehen, ein Klick fügt am Ende an. Projektdateien haben jetzt Schema 2; Dateien mit Schema 1 werden umgerechnet (`accent` wird zu Dach und Details).

## Folgen

- Testdrucke nötig:
  - Klemmkraft der Noppen
  - Zapfen der getrennten Teile
  - Schneckengetriebe
  - Stützen
- Am echten CyberBrick nachmessen:
  - Lochabstände der Empfänger-Platine
  - Akkumaße
  - Höhe von Platine und USB-Buchse
  - Lage des Schalters
- Markennamen (LEGO, DUPLO, CyberBrick) stehen nur beschreibend für die Kompatibilität.
