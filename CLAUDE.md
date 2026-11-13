# Traination

Web-Tool zum Planen, Konfigurieren und Exportieren 3D-druckbarer **Holzbahn-Teile**: Schienen-Elemente und Züge, kompatibel mit den gängigen Holzeisenbahnen (Brio, IKEA Lillabo und ähnliche).
Export als **3MF** für Bambu Studio / Orca Slicer. Aufbau und Konventionen folgen der Web-App von TactileManufactory (Repo `../TactileFactory`, siehe dessen `CLAUDE.md` und `web/`).

> Status: Konzeptphase. Es gibt noch keinen Code. Nächster Schritt: Messwerte der Spurweite an echten Schienen nehmen, danach das Gerüst in `web/` anlegen (Kern, erste Elemente, 3MF-Export).

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

## Fachregeln (Entwurf)
1. **Wizard-Reihenfolge**: Strecke → Elemente → Fahrzeuge → Design/Farben → Export. Strukturbaum und 3D-Vorschau begleiten jeden Schritt.
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

## Architektur (geplant)
```
web/src/
  core/       Parameter, Validierung, Streckenlogik (Verbinder-Graph, Kreisschluss, Stückliste)   (kein 3D, kein React)
  geometry/   manifold-3d-Builder: track/ (straight, curve, switch, crossing, ramp, buffer, adapter), vehicle/ (chassis, body, wheelset, coupler)
  presets/    Spurweite, Verbinder, Passungen, Magnetkatalog, Mindestwände, Druckerprofile
  export/     3MF (Bambu-Format), STL
  project/    Projektdatei .trproj
  ui/         React-Wizard, Streckenplaner (2D), 3D-Vorschau, Texte DE/EN
web/tests/    Invarianten (siehe unten)
docs/         concept.md, decisions/ (ADRs), reference/ (Messwerte, Fotos)
```
- Abhängigkeitsrichtung: `core` ← `geometry` ← `export`, `ui`. `core` importiert nie manifold-3d oder React.
- Parameter sind unveränderliche, validierte Datenobjekte. Geometrie ist eine reine Funktion `params -> Teile`.

## Konventionen
- **Einheiten: mm.** Koordinaten: Z nach oben, Ursprung in der Mitte des Teils (XY), Unterseite bei Z = 0. Schienen-Elemente: Fahrtrichtung entlang +X.
- Code, Kommentare, Commit-Messages: **Englisch**. Doku (`CLAUDE.md`, `docs/`): Deutsch. UI-Texte: Deutsch und Englisch über eine Übersetzungsschicht, keine Strings im Logikcode. Neue Texte immer in beiden Sprachen anlegen.
- Toleranzen und Mindestmaße sind **benannte Konstanten** in `presets/`, nie Magic Numbers im Builder-Code.
- **Passung/Spiel = Aufmaß auf das Gesamtmaß**, nicht je Seite: Zapfenkopf 12 mm + 0,3 → Buchse 12,3 mm.
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
Geklärt: Räder und Achsen werden selbst gedruckt. Kupplungen gibt es magnetisch und als Anhängekupplung.

- **Startumfang v1:** Vorschlag: Gerade, Kurve, Weiche, Lok und ein Waggon, Streckenplaner erst in v2. Oder der Planer von Anfang an?
- **Spurweite:** Messwerte an echten Brio- und IKEA-Schienen nehmen (siehe oben).
- **Räder:** Achse als Steckachse mit Clip, als Print-in-Place oder als Rad mit Klemmsitz auf der Achse? Per Testdruck klären.
- **Magnetkupplung:** Magnetgröße, Höhe über der Schiene, Polung (Brio-Konvention: welches Ende zieht an?). Soll das Tool die Polung markieren?
- **Anhängekupplung:** eigene Form oder kompatibel zu den Haken älterer Holzbahnen?
- **Zieldrucker:** nur Bambu P1S/X1C oder weitere Bauraum-Profile (A1 mini 180 mm)?
- **Verhältnis zu TactileManufactory:** eigenes Produkt oder später als weiterer Gerätetyp in derselben App? Gemeinsame Teile (3MF-Writer, Magnetkatalog, UI-Bausteine) ggf. als geteiltes Paket.
