# Traination – Web-App

Generator für 3D-druckbare Holzbahn-Teile (Brio-/IKEA-kompatibel):

- Strecke aus 14 Demo-Strecken wählen (Herz, Hundeknochen, Kopfbahnhof, Bergbahn mit Tunnel …) oder selbst bauen: „+“ an freien Enden der 3D-Ansicht oder Teile hineinziehen.
- Strecke automatisch schließen, auch mit berechneten Passkurven und Passgeraden; Stützen unter erhöhter Strecke kommen von selbst.
- Schienen mit Schwellen-Optik; Rampen, Brückenpfeiler und hohe Stützen mit Bögen (weniger Filament).
- Bahnhöfe, Bahnsteige, Tunnel, Bahnanlagen und Noppenplatten in Kategorien aufstellen.
- Im Schienenkonfigurator Teile einstellen: Noppenleisten je Seite (LEGO oder DUPLO, beliebig viele Reihen), Weichen mit Stellhebel.
- Züge aus vier Kategorien zusammenziehen, gestalten und einfärben, auch eine E-Lok mit Bambu Lab CyberBrick.
- Alles druckt ohne Stützmaterial; die Tests prüfen jedes Teil auf Überhang.
- Alles als 3MF für Bambu Studio exportieren.

Alles rechnet im Browser (manifold-3d als WebAssembly in einem Web Worker), es gibt keinen Server.

## Befehle

```
npm install          # einmalig
npm run dev          # Entwicklungsserver (http://localhost:5173)
npm test             # Unit-Tests (Kern, Geometrie, Export, Texte, Store)
npm run typecheck
npm run build        # Produktions-Build nach dist/
npm run test:e2e     # Build + Browser-Tests mit installiertem Chrome (sonst Edge)
npm run render       # Bilder der Geometrie ohne Browser nach renders/ (Entwicklerwerkzeug)
```

`TRAINATION_SHOTS=<ordner>` legt bei `test:e2e` Screenshots jedes Schritts ab.

**Windows:** Node muss im PATH sein (`C:\Program Files\nodejs`). Vitest startet nur sauber, wenn das Laufwerk großgeschrieben ist (`C:\…`, nicht `c:\…`). Sonst meldet es „failed to find the runner“. In PowerShell deshalb vorher `Set-Location C:\Users\…\Traination\web`.

## Aufbau

```
src/
  presets/    Spurweite, Verbinder, Fahrzeugmaße, Passungen, Drucker (benannte Konstanten)
  core/       reine Logik: Elemente (Pfade, Anschlüsse), Plan (Baum, Kreisschluss, Stückliste),
              Stellweiche, Gebäude, Fahrzeuge (Maße, Prüfungen), Projekt (.trproj), Fahrstrecke für die Vorschau
  geometry/   manifold-3d: Schienen (Profil entlang der Pfade, Rillen, Zapfen, Buchsen, Schieber),
              Fahrzeuge (Fahrgestell, Kupplungen, Aufbauten, Räder, Achsen), Gebäude, Überhang-Prüfung, Engine
  export/     Bambu-3MF-Writer (aus TactileManufactory), Druckbetten, Druckteile
  app/        Store (Rückgängig/Wiederholen, Autosave), Worker, Engine-Client mit Cache
  ui/         React: Wizard „Studio“, 3D-Ansicht (three.js), Plan (SVG), Texte DE/EN
tests/        Vitest; tests/e2e: Browser-Tests (playwright-core)
```

Abhängigkeitsrichtung: `presets` ← `core` ← `geometry` ← `export`, `app`, `ui`. `core` kennt weder manifold noch React.
