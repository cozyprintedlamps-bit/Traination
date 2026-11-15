# ADR 0009 – Der Plan ist in jedem Schritt offen

Datum: 15.11.2026 · Status: angenommen

## Kontext

Der Plan mit dem Strukturbaum stand nur in den Schritten Strecke, Übersicht und Export, im Schritt „Elemente“ nur ab 1900 px Fensterbreite, in „Züge“ und „Design“ gar nicht (ADR 0004, 0006, 0008). Gewünscht: Der Plan ist immer offen, in jedem Schritt.

## Entscheidungen

1. **Immer da:** Das Plan-Feld mit Plan und Strukturbaum steht in allen sechs Schritten rechts. Die Liste `WITH_PLAN`, die Bildschirmbreite 1900 px und die Bedingung dafür sind entfallen. Auf Bildschirmen unter 1000 px stapeln sich die Felder wie bisher, der Plan folgt dann unter der Seite.
2. **Bearbeiten wie bisher:** Ziehen im Plan, Farbfeld und Mülleimer des Baums gibt es nur im Schritt „Strecke“. Sonst wählt man nur aus. Im Plan lässt sich in jedem Schritt ein Stück anklicken; in „Elemente“ wählt das auch das Element.
3. **Fahrzeuge:** In „Züge“ und „Design“ wählt ein Klick auf ein Fahrzeug im Baum zugleich das Fahrzeug, das die Seite bearbeitet (`selectCar` setzt `car` und `vehicle`). Im Plan wird es blau markiert.
4. **3D-Ansicht dahinter:** Mit zwei Fenstern links und dem Plan rechts bleibt für die Strecke nur ein schmaler Streifen: bei 1600 px Fensterbreite gut 200 px, bei 1920 px rund 500 px. Die Strecke wird dort entsprechend klein gezeigt. Damit sie dabei nicht unter dem Plan verschwindet, hat `SceneView` die Grenze für den verdeckten Streifen geändert: Er darf beliebig breit sein, solange mindestens 120 px frei bleiben (vorher höchstens die halbe Breite).

## Offen

- Unter etwa 1400 px Fensterbreite ist der freie Streifen kleiner als 120 px; dann reicht der Streifen nur noch bis zu dieser Mindestbreite und die Strecke rutscht teilweise unter den Plan. Mögliche Abhilfe: Fenster oder Plan dort schmaler machen oder den Plan einklappbar machen.
- Der Plan markiert das gewählte Fahrzeug nur, wenn man es im Baum gewählt hat, nicht beim Klick in der Zugliste.
