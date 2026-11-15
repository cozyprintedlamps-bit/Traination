# ADR 0009 – Fenster in „Züge“ und „Design“, nur Standardelemente in der Auswahl

Datum: 15.11.2026 · Status: angenommen

## Kontext

Der Schritt „Elemente“ hat seit ADR 0007 ein zweites Fenster neben der Seite, und die große 3D-Ansicht zeigt dahinter die Strecke. Gewünscht: Dasselbe in „Züge“ und „Design“. Dort öffnet sich rechts ein Fenster mit dem 3D-Modell des Zuges; die Strecke bleibt unverändert zu sehen. Unter dem Modell stehen im Schritt „Züge“ die Fahrzeuge des Zuges. Außerdem sollen in der Auswahl der Elemente nur Standardteile stehen, Noppen werden im Konfigurator zugefügt.

## Entscheidungen

1. **Ein Fenster in drei Schritten:** „Elemente“, „Züge“ und „Design“ haben ein Fenster gleicher Größe rechts neben der Seite (`WINDOWS` in `App.tsx`, Klasse `.with-detail`). Die große 3D-Ansicht beginnt dahinter. Der Plan ist in jedem Schritt rechts (ADR 0010).
2. **Große 3D-Ansicht:** Sie zeigt in jedem Schritt die ganze Strecke mit Gebäuden und Zug, ohne Markierung (`useScene`). Das Fahrzeugmodell mit den durchsichtigen Schienen gibt es nur noch im Fenster (`useVehicleScene`, `VehicleModel`, Test-ID `vehicle-model`). Die Schienen darin sind weiter zu 78 % durchsichtig.
3. **Fenster „Züge“:** Oben das 3D-Modell des gewählten Fahrzeugs oder des ganzen Zuges, darunter in einem Rollbereich die Zugliste „Zug (vorn → hinten)“ mit dem Schalter „Fahrzeug / Ganzer Zug“. Die Liste ist aus der Seite links herausgewandert; dort bleiben Zug-Vorlagen, Palette, Daten des Fahrzeugs und seine Gestaltung.
4. **Fenster „Design“:** Es ist dasselbe Fenster wie in „Züge“ (`VehiclesWindow`): oben das Modell, darunter die Zugliste mit dem Schalter „Fahrzeug / Ganzer Zug“. Ein Klick auf ein Fahrzeug wählt es, die Seite links zeigt dann seine Farben („Farben von …“). Die Liste lässt sich dort auch umordnen. Gewählter Zug und Schalter gelten in beiden Schritten. Zuerst hatte das Design-Fenster nur das Modell; die Zugliste kam auf Wunsch dazu.
5. **Standardelemente:** `standardElements()` enthält nur noch schlichte Stücke. Die Stücke „Gerade 216 mm mit LEGO-Noppen“ und „… mit DUPLO-Noppen“ gibt es nicht mehr; Noppen stellt man im Konfigurator am Element ein.
   - Die Demo-Strecke „Noppen-Stadt“ (ADR 0004) bringt ihre beiden gemischten Stücke (`straight-216-mixed`, `curve-large-mixed`) selbst mit, wie die Achter-Strecke ihre Kreuzung. Sie erscheinen in der Liste erst, wenn man diese Strecke anwendet.
   - Alte Projekte werden beim Laden bereinigt (`mergeLegacyStudElements` in `project.ts`): Die beiden früheren Standardstücke fliegen heraus, wenn kein Stück sie benutzt, auch wenn man sie geändert hatte. Benutzen Stücke sie, wandern diese Stücke auf die Standard-Gerade, die die Noppen und eine eigene Farbe übernimmt. Das sieht danach gleich aus und der Plan bleibt geschlossen. Hat die Standard-Gerade schon Noppen oder eine andere Länge, bleibt das alte Stück bestehen. Dasselbe gilt für das zweite Stück, wenn ein Projekt beide Stücke benutzt.
6. **Überschriften:** Im Schritt „Elemente“ heißt die Seite links „Standardelemente“. „Elemente konfigurieren“ steht als Überschrift im rechten Fenster.

## Offen

- Hat man eine Demo-Strecke mit eigenen Stücken angewandt (Noppen-Stadt, Achter, Herz), bleiben diese Stücke in der Liste der Standardelemente, bis man sie löscht.
