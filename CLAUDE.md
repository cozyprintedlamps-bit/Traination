# Traination

Web-Tool zum Planen, Konfigurieren und Exportieren 3D-druckbarer **Holzbahn-Teile**: Schienen-Elemente und Züge, kompatibel mit den gängigen Holzeisenbahnen (Brio, IKEA Lillabo und ähnliche).
Export als **3MF** für Bambu Studio / Orca Slicer. Aufbau und Konventionen folgen der Web-App von TactileManufactory (Repo `../TactileFactory`, siehe dessen `CLAUDE.md` und `web/`).

> Status (14.11.2026): Erste Version (ADR 0001) und Ausbau (ADR 0002) sind in `main`. Der Streckenbau liegt auf Branch `feature/streckenbau` (ADR 0003). Der Wizard hat sechs Schritte:
>
> 1. **Strecke:**
>    - 11 Vorlagen.
>    - Teile mit „+“ an freien Enden der 3D-Ansicht oder per Drag & Drop in 3D-Ansicht und Plan.
>    - „Strecke schließen“ mit berechneten Passkurven, Passgeraden und Adapter.
>    - „Strecke leeren“.
>    - Automatische Stützen.
>    - Bahnhöfe und Gebäude.
>    - Der Plan ist eine kleine Übersichtskarte, die immer die ganze Strecke zeigt.
> 2. **Elemente:** 9 Arten, dazu Noppenleisten (LEGO-/DUPLO-kompatibel) und Schwellen-Optik.
> 3. **Züge:**
>    - 4 Kategorien mit 21 Bauarten, darunter die CyberBrick-E-Lok mit Schneckenantrieb.
>    - Zug-Vorlagen.
>    - Fahrzeuge werden per Drag & Drop in den Zug gezogen; Ansicht „Ganzer Zug“.
> 4. **Design:** Muster, Name/Nummer, Gesicht, Lampen, Puffer, Schienenräumer; 7 Farbbereiche; Teile getrennt drucken und stecken oder mehrfarbig in einem Teil.
> 5. **Übersicht:** Kennzahlen und Filament je Farbe (geschätzt aus Wänden, Haut und Füllung).
> 6. **Export:** 3MF für Strecke mit Stützen, für Züge und für Gebäude.
>
> 177 Unit-Tests und 7 Browser-Tests.
>
> **Noch nicht geprüft:**
> - Maße an echten Schienen und CyberBrick-Teilen.
> - Testdrucke.
> - Öffnen der 3MF in Bambu Studio.

## Ziele & Randbedingungen
- **Web-App, die Berechnung läuft im Browser des Nutzers** (kein Rechen-Server). Geometrie mit **manifold-3d**, Oberfläche in **React**, wie TactileManufactory (dort ADR 0004).
- Endnutzer sind Eltern, Maker und Backer, keine CAD-Profis: einfacher Wizard, sinnvolle Defaults, verständliche Fehlermeldungen.
- Gedruckte Teile müssen **mit gekauften Holzbahnen zusammenpassen**: Schienen mit Schienen, Züge auf fremden Schienen, Kupplungen mit fremden Zügen.
- Alles ist ohne Stützmaterial druckbar, sonst meldet das Tool es. Kein Pausieren im Druck: Magnete und andere Einlegeteile werden nach dem Druck eingesetzt.

## Glossar
- **Element**: ein Schienenstück (Gerade, Kurve, Weiche, Kreuzung, Rampe, Prellbock, Adapter, später Brücke, Tunnel, Bahnhof).
- **Rille**: eine der zwei Laufrillen im Element, in denen die Räder laufen und geführt werden.
- **Verbinder**: Steckverbindung zwischen zwei Elementen. **Zapfen** (männlich, Hals + runder Kopf) und **Buchse** (weiblich, passende Aussparung).
- **Strecke / Layout**: Anordnung von Elementen, verbunden über ihre Verbinder (Graph aus Elementen und Anschlüssen).
- **Fahrzeug**: Lok oder Waggon, aufgebaut aus **Chassis**, **Aufbau** (Design), **Radsätzen** und **Kupplungen**.
- **Radsatz**: zwei Räder auf einer Achse, beides gedruckt.
- **Kupplung**: Verbindung zwischen Fahrzeugen, **magnetisch** oder als **Anhängekupplung** (Haken und Öse).
- **Abschnitt**: farbiger Teil eines Aufbaus (Dach, Details, Ladung, Muster). Mit **Befestigung** (flache Unterseite, Zapfenplätze) kann er getrennt gedruckt und gesteckt werden.
- **Passstück**: Gerade (Passgerade) oder Kurve (Passkurve) in genau dem Maß, das „Strecke schließen“ für eine Lücke berechnet.
- **Schwelle**: Steg zwischen den Rillen; dazwischen ist das Gleis offen (Schwellen-Optik).
- **Stütze**: Pfeiler unter erhöhter flacher Strecke, automatisch an Stößen und unter langen Stücken.
- **Noppenleiste**: Leiste neben dem Gleis mit LEGO- oder DUPLO-kompatiblen Noppen.

## Fachregeln (Entwurf)
1. **Wizard-Reihenfolge**: Strecke → Elemente → Züge → Design/Farben → Übersicht → Export. Die 3D-Vorschau begleitet jeden Schritt, der Plan die Schritte Strecke, Elemente, Übersicht und Export.
2. **Spurweite**: Alle Maße der Schiene sind **benannte Konstanten** in `presets/` und für alle Elemente gleich. Rillenbreite, -tiefe und -abstand sind nicht frei einstellbar, damit die Kompatibilität bleibt. Einstellbar sind nur die **Passungen**.
3. **Verbinder**: Jedes Ende hat Zapfen oder Buchse. Die Buchse ist um die einstellbare **Verbinder-Passung** größer als der Zapfen. Adapter-Elemente (Zapfen-Zapfen, Buchse-Buchse) lösen Richtungsprobleme im Layout.
4. **Elemente** sind parametrisch: Gerade (Länge), Kurve (Radius, Winkel), Weiche (links/rechts/Y, Radius), Kreuzung, Rampe (Höhe, Länge), Prellbock. Optional **beidseitig nutzbar** (Rillen oben und unten).
5. **Streckenplaner**: Elemente rasten in der Draufsicht an Verbindern ein. Das Tool prüft den **Kreisschluss** mit Toleranz (Holzbahnen haben Spiel) und erzeugt eine Stückliste.
6. **Räder werden selbst gedruckt**, Achse ebenfalls. Der Radabstand folgt dem Rillenabstand, die Radbreite ist kleiner als die Rillenbreite (abzüglich einer **Rad-Passung**). Die Achse sitzt mit Spiel im Chassis, damit sich die Räder frei drehen.
7. **Kupplungen**: wählbar je Fahrzeugende, **magnetisch** (Magnet aus dem Katalog, Tasche als Sackloch, eingepresst nach dem Druck) oder **Anhängekupplung** (Haken und Öse, gedruckt). Bei Magnetkupplungen muss die Polung zum Anziehen passen, siehe offene Fragen.
8. **Design**: Lok- und Waggontypen (z. B. Dampflok, E-Lok, Kastenwagen, Kesselwagen, Tender, Flachwagen) mit wählbaren Aufbauten und Details. Jedes Teil bekommt eine Farbe, die im 3MF als Filament-Zuweisung landet.
9. **Export**: 3MF im Bambu-Format, Teile in Druckausrichtung auf mehrere Druckbetten verteilt. Gleiche Teile wahlweise einmal mit Stückzahl oder vollständig ausgelegt. **Bauraum-Prüfung** gegen den Zieldrucker (Default P1S, 256 × 256 mm): Zu große Teile werden gemeldet.
10. **Projekte**: speichern und laden als `.trproj` (JSON mit Schema-Version). Alle Parameterobjekte sind serialisierbar und versioniert.

## Spurweite (vorläufig, an echten Schienen nachmessen)
Richtwerte für Brio-kompatible Schienen. Vor dem ersten Testdruck mit dem Messschieber an Brio- und IKEA-Schienen prüfen und hier eintragen:
- Schienenbreite ≈ **40 mm**, Dicke ≈ **12 mm**
- Rillen: Breite ≈ **6 mm**, Tiefe ≈ **3 mm**, Abstand der Rillenmitten ≈ **25 mm**
- Zapfen: Hals ≈ **6 mm** breit, Kopf ≈ **Ø 12 mm**, Länge ≈ **17 mm** ab Schienenende
- Kurven: Radien und Winkel der Standardkurven (Brio: 8 kurze bzw. 8 lange Kurven = Vollkreis) nachmessen.
- Kupplungsmagnet und Kupplungshöhe an einem Brio-Zug messen.

## Tech-Stack
- **TypeScript**, Build mit **Vite**, Tests mit **Vitest**.
- Geometrie: **manifold-3d** (Apache-2.0), läuft als WebAssembly im Browser.
- Oberfläche: **React**, Design wie „Studio“ in TactileManufactory (schwebende Felder über der 3D-Ansicht, Hell und Dunkel, Navigation links).
- 3D-Ansicht: three.js (MIT).
- 3MF-Export: eigener Writer im Bambu-Format, angelehnt an `web/src/export/` in TactileManufactory (Filament-Profilnamen, Druckbetten, `inherits_group`).

## Architektur
```
web/src/
  presets/    gauge.ts (Spurweite, Verbinder, Standardstücke, Stützen), vehicle.ts (Räder, Achsen, Kupplungen, Magnete), print.ts (Passungen, Drucker),
              bricks.ts (LEGO/DUPLO-Raster), cyberbrick.ts (Elektronik, Motor, Getriebe)
  core/       track.ts (Elemente: Pfade + Anschlüsse, Varianten, Noppenleisten), layout.ts (Plan als Baum, Kreisschluss, Überlappung, Stückliste),
              autoclose.ts (Strecke schließen: Routen aus Bögen und Geraden, Passstücke), supports.ts (Stützen), buildings.ts (Gebäude), material.ts (Filament-Schätzung),
              vehicle.ts (Kategorien, Bauarten, Farben, Gestaltung, Maße, Prüfungen), project.ts (Projekt, Strecken- und Zug-Vorlagen, Gebäude-Platzierung, .trproj Schema 2), route.ts (Zug auf der Strecke)
  geometry/   track.ts (Profil-Sweep, Rillen, Zapfen/Buchsen, Schwellen, Rampen und Brücke mit Bögen, Prellbock, Noppen, Stützen), vehicle.ts (Fahrgestell, Kupplungen, Aufbauten mit Abschnitten),
              decor.ts + text.ts (Muster, Strichschrift, Gesicht), gears.ts (Schnecke, Schneckenrad), cyberbrick.ts, buildings.ts, engine.ts
  export/     bambu3mf.ts (aus TactileManufactory), plates.ts (Druckbetten, Dateien à 4 Platten), printItems.ts (Strecke + Stützen, Fahrzeuge, Gebäude)
  app/        store.ts (Zustand, Rückgängig, Autosave, Gebäude, Strecke schließen, Drag & Drop), engine.worker.ts, engineClient.ts (Cache)
  ui/         App, Seiten je Schritt (Track, Elements, Vehicles, Design, Overview, Export), PlanView (SVG, Übersichtskarte), SceneView/Viewer3D (three.js, „+“-Marker, Drop),
              TrackTools (Teile-Menü, Drag-Daten), texts_de/texts_en, styles.css
web/tests/    Unit-Tests; e2e/ Browser-Tests; render.test.ts = Bilder ohne Browser (`npm run render`)
docs/         decisions/ (ADRs)
```
- Abhängigkeitsrichtung: `presets` ← `core` ← `geometry` ← `export`, `app`, `ui`. `core` importiert nie manifold-3d oder React.
- **Element-Frame:** Anschluss 0 im Ursprung, zeigt nach −X, Strecke läuft nach +X; „links“ = gegen den Uhrzeigersinn. Jedes Stück im Plan steckt mit `port` an `parent.port` seines Elternstücks; Wurzelstücke haben `at` (Lage, Drehung).
- **Fahrzeug-Frame:** Z = 0 Unterkante Fahrgestell, vorn = +X. Die Räder reichen bis zum Rillengrund, das Fahrgestell hält `TRACK_CLEARANCE` über der Schiene. Der Aufbau hat Z = 0 auf dem Deck.

## Befehle (in `web/`)
```
npm install / npm run dev / npm test / npm run typecheck / npm run build
npm run test:e2e      # Build + Browser-Tests (installierter Chrome, sonst Edge); TRAINATION_SHOTS=<ordner> für Screenshots
npm run render        # Bilder von Elementen, Fahrzeugen und Vorlagen nach web/renders/ (ohne Browser)
```
**Windows:** Node liegt unter `C:\Program Files\nodejs` und ist nicht im PATH der Shell (vorher ergänzen). Vitest braucht ein **großes Laufwerk** im Arbeitsverzeichnis (`C:\…`). Mit `c:\…` meldet es „failed to find the runner“. Unter Git Bash kein `python` aufrufen: Der Store-Platzhalter hängt.
- Parameter sind unveränderliche, validierte Datenobjekte. Geometrie ist eine reine Funktion `params -> Teile`.

## Konventionen
- **Einheiten: mm.** Koordinaten: Z nach oben, Ursprung in der Mitte des Teils (XY), Unterseite bei Z = 0. Schienen-Elemente: Fahrtrichtung entlang +X.
- Code, Kommentare, Commit-Messages: **Englisch**. Doku (`CLAUDE.md`, `docs/`): Deutsch. UI-Texte: Deutsch und Englisch über eine Übersetzungsschicht, keine Strings im Logikcode. Neue Texte immer in beiden Sprachen anlegen.
- Toleranzen und Mindestmaße sind **benannte Konstanten** in `presets/`, nie Magic Numbers im Builder-Code.
- **Passung/Spiel = Aufmaß auf das Gesamtmaß**, nicht je Seite: Zapfenkopf 11,5 mm + 0,4 → Buchse 11,9 mm.
- Deterministisch: gleiche Parameter → gleiche Geometrie.
- Zeilenenden LF (`.gitattributes`). Keine Binärdateien > 1 MB ins Git ohne Absprache.

## Qualität / Tests
Geometrie-Invarianten werden getestet, nicht nur „läuft durch“:
- Rillenmaße und -abstand jedes Elements entsprechen den Konstanten, auch in Kurven und Weichen.
- Zapfen passt mit Passung in die Buchse, auch zwischen verschiedenen Element-Typen.
- Streckenlogik: Anschlüsse in Lage und Richtung korrekt, Kreisschluss erkannt, Stückliste stimmt.
- Fahrzeug: Radabstand = Rillenabstand, Räder passen in die Rille, Achse dreht frei (Mindestspiel), Fahrzeug steht innerhalb der Lichtraumgrenze.
- Magnettaschen sind Sacklöcher mit Mindestwand. Teile sind geschlossen (manifold) und passen ins Druckbett.
- Export: 3MF öffnet in **Bambu Studio**, Farben, Objekte und Druckbetten stimmen.

## Zusammenarbeit
- Entscheidungen mit Tragweite als kurzes ADR in `docs/decisions/NNNN-titel.md`.
- Feature-Branches + Pull Requests, kleine Commits, Tests grün vor jedem Merge.
- **Merges in `main` immer als Merge-Commit** (`git merge --no-ff feature/<name>`, Nachricht `Merge feature/<name>: <ein Satz>`), davor auf `main` rebasen. Auf `main` nur `git pull --ff-only`.
- Claude: bei größeren Änderungen erst einen Plan vorlegen, keine Dependencies ohne Begründung ergänzen, Lizenzen neuer Libs prüfen.

## Lizenzen
- Quellcode privat, alle Rechte vorbehalten, bis eine Lizenz entschieden ist.
- Abhängigkeiten nur mit **permissiver oder LGPL-Lizenz** (MIT, BSD, Apache-2.0, LGPL). **Keine GPL/AGPL-Bibliotheken.**
- Markennamen (Brio, IKEA) nur beschreibend für die Kompatibilität verwenden, nie als Produktname oder Logo.

## Offene Fragen (bitte klären, dann hier streichen)
Geklärt: Räder und Achsen werden selbst gedruckt. Kupplungen gibt es magnetisch und als Anhängekupplung. Der Streckenplaner ist von Anfang an dabei (erste Version gebaut, 13.11.2026).

- **Spurweite:** Messwerte an echten Brio- und IKEA-Schienen nehmen (siehe oben), vor allem Zapfen, Buchse, Rillen und die Kurvenradien (vorläufig R 182 und R 90, je 45°).
- **Räder (umgesetzt, Testdruck offen):** Rad liegt im Schlitz zwischen Träger und Schürze. Die Achse wird von außen durchgeschoben und in das Rad gepresst; die Abflachung (D-Profil) nimmt das Rad mit. Prüfen: Pressung 0,15 mm, Achsspiel 0,5 mm, Raddurchmesser 16 mm.
- **Magnetkupplung (umgesetzt, Testdruck offen):** Standard Ø 8 × 3 mm, Mitte 7 mm über Unterkante Fahrgestell, Polung vorn Nord / hinten Süd nach außen (Hinweis im Tool, keine Markierung am Teil). Brio-Höhe und -Polung nachmessen.
- **Rampen:** 2 × 38 mm auf 216 mm ist steil (Smoothstep, größte Steigung ≈ 26 %). Mit echten Zügen probieren, ggf. längere Rampen als Standard.
- **Anhängekupplung:** eigene Form oder kompatibel zu den Haken älterer Holzbahnen?
- **Noppen (umgesetzt, Testdruck offen):** Klemmkraft der gedruckten LEGO-/DUPLO-Noppen prüfen (`presets/bricks.ts`, `STUD_FIT`).
- **CyberBrick (umgesetzt, nachmessen):** Lochabstände der Empfänger-Platine, Akkumaße, Höhe von Platine und USB-Buchse, Lage des Schalters (`presets/cyberbrick.ts`). Das Schneckengetriebe (Modul 1, 15:1) per Testdruck prüfen.
- **Getrennte Teile (umgesetzt, Testdruck offen):** Zapfen Ø 3 mm mit 0,15 mm Spiel für Dach, Schornstein, Dom, Ladung und Gebäudedächer.
- **Schwellen und Bögen (umgesetzt, Testdruck offen):** Hält die 2-mm-Wand zwischen Rille und Schwellen-Lücke? Drucken die 45°-Spitzbögen von Rampen, Brückenpfeilern und Stützen sauber ohne Stützmaterial?
- **Filament-Schätzung:** Die Formel in `core/material.ts` einmal mit dem Wert vergleichen, den Bambu Studio nach dem Slicen anzeigt; ggf. die Konstanten in `presets/print.ts` anpassen.
- **Zieldrucker:** P1S/X1C, A1 und A1 mini sind wählbar. Die Profilnamen für A1/A1 mini (`export/bambuProfiles.ts`) sind noch nicht mit Bambu Studio geprüft.
- **3MF in Bambu Studio:** Der Writer ist aus TactileManufactory übernommen und dort geprüft. Mit Traination-Teilen (viele Objekte, Volumen für Details) einmal in Bambu Studio öffnen.
- **Verhältnis zu TactileManufactory:** eigenes Produkt oder später als weiterer Gerätetyp in derselben App? Gemeinsame Teile (3MF-Writer, Magnetkatalog, UI-Bausteine) ggf. als geteiltes Paket.
