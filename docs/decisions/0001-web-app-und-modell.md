# ADR 0001 – Web-App und Datenmodell

Datum: 13.11.2026 · Status: angenommen

## Kontext

Traination soll Holzbahn-Strecken, -Elemente und -Züge erzeugen, die mit Brio, IKEA Lillabo und kompatiblen Bahnen zusammenpassen, und sie als 3MF für Bambu Studio ausgeben. TactileManufactory hat gezeigt, dass eine Desktop-App schwer auszuliefern ist. Die Web-App mit Rechnung im Browser (dort ADR 0004) funktioniert.

## Entscheidung

1. **Web-App wie TactileManufactory:** TypeScript, manifold-3d im Web Worker, React, three.js, Vite/Vitest. Der 3MF-Writer und die Bambu-Farben und -Profile sind aus TactileManufactory übernommen.
2. **Elemente als Pfade mit Anschlüssen:** Jedes Element besteht aus Mittellinien (Gerade oder Bogen, Rampen mit Höhenverlauf) und Anschlüssen (Lage, Richtung, Zapfen oder Buchse). Die Geometrie zieht das Schienenprofil entlang der Pfade und schneidet die Rillen. Neue Elementarten brauchen nur neue Pfade.
3. **Plan als Baum:** Jedes Stück merkt sich, an welchem Anschluss welches Elternstücks es steckt. Ändert sich ein Elementtyp (z. B. der Radius), wandert alles dahinter mit. Kreise werden über Anschlüsse erkannt, die sich treffen (Toleranz 2 mm, 3°).
4. **Varianten statt Typen:** „Gespiegelt“ (Links-/Rechtskurve) und „Enden getauscht“ (Zapfen ↔ Buchse) sind Varianten eines Elementtyps. Bei beidseitig nutzbaren Schienen ist eine gespiegelte Kurve dasselbe Druckteil, nur umgedreht. Die Stückliste zählt sie deshalb zusammen.
5. **Fahrzeuge in vier Druckteilen:** Fahrgestell mit Kupplungen, Aufbau (aufgesteckt auf zwei Zapfen, Details als eigenes Filament-Volumen), Räder und Achsen. Die Räder sitzen zwischen Mittelträger und Schürze. Achse und Radloch haben eine Abflachung, damit sich Rad und Achse gemeinsam drehen. Alles ist ohne Stützmaterial druckbar, Brücken liegen kopfüber.
6. **Kupplungen:** Magnet (Kopf mit Tasche, Polung: vorn Nord, hinten Süd nach außen) oder Haken/Öse (vorn Haken, hinten Öse). Wählbar je Fahrzeugende.

## Folgen

- Alle Maße der Spurweite sind vorläufig (`web/src/presets/gauge.ts`). Sie müssen an echten Schienen gemessen und per Testdruck bestätigt werden.
- Rampen steigen mit Smoothstep (kein Knick an den Enden). Sie sind hohl: Seitenwände und Querrippen tragen die Schiene.
- Ein Bambu-Projekt hält höchstens vier Druckbetten an ihrem Platz. Mehr Teile gehen in weitere Dateien (`-1.3mf`, `-2.3mf` …).
