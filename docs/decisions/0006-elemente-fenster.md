# ADR 0006 – Zweites Fenster im Schritt „Elemente“

> Seit dem 15.11.2026 heißt dieser Schritt in der Oberfläche „Schienen Konfigurator“ (Englisch „Track configurator“); im Code bleibt er `elements`.

Datum: 15.11.2026 · Status: angenommen

## Kontext

Im Schritt „Elemente“ stand die Liste der Elemente samt allen Einstellungen in einem Seitenfeld. Die große 3D-Ansicht zeigte nur das gewählte Element, die ganze Strecke sah man im Plan. Gewünscht: Die 3D-Ansicht der ganzen Strecke bleibt im Hintergrund. Neben dem Seitenfeld öffnet sich nach rechts ein gleich großes Fenster mit dem 3D-Modell des Elements oben und den Einstellungen darunter.

## Entscheidungen

1. **Zwei Fenster:**
   - Links bleibt das Seitenfeld mit der Liste der Standardelemente und „Neues Element“. Die Überschrift dort heißt „Standardelemente“; „Elemente konfigurieren“ steht als Überschrift im rechten Fenster.
   - Rechts daneben steht das Fenster `ElementDetail`, gleich breit und hoch (`--page-w`, Oberkante 76 px, Unterkante 74 px). Es hat oben eine kleine 3D-Ansicht des Elements und darunter, in einem eigenen Rollbereich, die Einstellungen des Elements (Name, Maße, Noppenleiste, Farbe, Duplizieren, Löschen) und „Schienen allgemein“.
   - Unter 1000 px Breite stapeln sich die Felder wie überall, das Detailfenster folgt auf das Seitenfeld.
2. **3D-Ansicht:**
   - Die große Ansicht zeigt in allen Schritten dieselbe Szene, die ganze Strecke mit Gebäuden und Zug (seit ADR 0008 auch in „Züge“ und „Design“). Beim Wechsel der Schritte bleibt die Kamera deshalb stehen (gleicher `fitKey`).
   - Die Ansicht beginnt rechts von den beiden Fenstern (`.with-detail` setzt `--inset-l` neu).
   - Im Schritt „Elemente“ sind alle Stücke des gewählten Elements heller (`trackParts(..., { type })`), damit man sieht, wo eine Änderung wirkt. Das ersetzt die gestrichelte Markierung im Plan.
   - Die Elementansicht im Fenster ist ein zweites `Viewer3D` mit eigener Test-ID (`element-model`). Sie baut das Modell neu, wenn sich das Element oder die Schieneneinstellungen ändern, und passt die Kamera nur beim Wechsel des Elements an.
3. **Plan:** Zuerst stand er im Schritt „Elemente“ nur ab 1900 px Fensterbreite rechts, weil neben zwei Fenstern wenig Platz bleibt. Das gilt nicht mehr: Seit ADR 0009 ist der Plan in jedem Schritt da.

## Offen
