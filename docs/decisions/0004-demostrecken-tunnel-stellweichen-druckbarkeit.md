# ADR 0004 – Demo-Strecken, Gebäude-Kategorien, Tunnel, Stellweichen, Noppen je Seite und Druckbarkeits-Prüfung

Datum: 14.11.2026 · Status: angenommen (Stellweiche, Tunnel und neue Gebäude vorläufig, Testdruck offen)

## Kontext

Wünsche nach dem Streckenbau (ADR 0003):

- Turm (Signal) und Bahnhof sollen nicht mehr bei jeder Strecke von selbst dastehen.
- Schritt 2 soll „Schienenkonfigurator“ heißen.
- Beliebig viele Noppen an der LEGO- und an der DUPLO-Seite.
- Unter Schritt 1 die Strecken als „Demo-Strecken (vorgefertigt)“, dazu ein eigener Knopf „Eigene Strecke erstellen“.
- Den kleinen Kreis entfernen, mehr und kreativere Strecken.
- Verschiedene Bahnhöfe und Bahnsteige, Tunnel, alles in Kategorien.
- Züge, Wagen und Gebäude viel detaillierter, dabei immer druckbar.
- Weichen, die sich mechanisch umstellen lassen.

## Entscheidungen

1. **Keine automatischen Gebäude:**
   - Neue Projekte und Demo-Strecken bringen keinen Bahnhof und kein Signal mehr mit.
   - Eine Demo-Strecke bringt nur mit, was zu ihr gehört: Tunnel bei der Bergbahn, Bahnsteige und Stadtbahnhof beim Kopfbahnhof, Noppenplatten bei der Noppen-Stadt. Diese Gebäude tragen `fromTemplate`.
   - Wählt man eine andere Demo-Strecke oder „Eigene Strecke erstellen“, gehen sie mit. Ändert oder verschiebt man so ein Gebäude, gehört es dem Nutzer und bleibt.
2. **Schritt 1:**
   - Abschnitt „Demo-Strecken (vorgefertigt)“ mit 14 Strecken, darunter der Knopf „Eigene Strecke erstellen“ (leerer Plan).
   - Neu sind Herz, Schlängelbahn, Hundeknochen, Kopfbahnhof und Bergbahn mit Tunnel. Die LEGO-Stadt heißt jetzt Noppen-Stadt.
   - Das Herz schließt mit vier Geraden zu 182 mm genau (2 × 182 = Durchmesser einer großen Kurve), die Schlängelbahn mit einer berechneten Passgerade.
   - Die Teile-Liste und die Element-Liste sind nach Kategorien gegliedert: Geraden, Kurven, Weichen & Kreuzungen, Rampen & Brücken, Prellböcke & Adapter.
3. **Gebäude in Kategorien** (`core/buildings.ts`):

   | Kategorie | Gebäude |
   |---|---|
   | Bahnhöfe | Landbahnhof, Stadtbahnhof mit Uhrturm, Haltepunkt mit Wartehäuschen, Bahnhofshalle über zwei Gleise |
   | Bahnsteige | einfach, mit Dach, Inselbahnsteig |
   | Tunnel | Bergtunnel, Kurventunnel, Tunnelportal |
   | Bahnanlagen | Stellwerk, Wasserturm, Lokschuppen, Signal |
   | Stadt & Noppen | Haus, LEGO-Platte, DUPLO-Platte |

   - Gebäude haben jetzt beliebig viele Dachteile (`roofs`), etwa Hauptdach und Turmspitze.
   - Tunnel, Portal, Lokschuppen und Halle stehen über dem Gleis (`OVER_TRACK`). Mit einem gewählten Schienenstück legen sie sich genau darüber, `arrangeBuildings` rückt sie nicht beiseite.
4. **Tunnel:**
   - Eine Haube, die über die Schiene gestellt wird. So passt sie auch über gekaufte Schienen und bleibt ein eigenes, kleineres Druckteil.
   - Die Öffnung (`TUNNEL_BORE`, 64 mm breit) hat senkrechte Wände bis 57 mm und darüber eine 45°-Spitze. Neben einem Fahrzeug bleibt so viel Höhe wie unter einer Brücke (60 mm über Schienenoberkante). Die Höhenprüfung der Fahrzeuge rechnet Tunnel, Portale und Lokschuppen mit ein.
   - Der Berg ist ein felsiger Querschnitt mit Bergspitzen. Jede Stufe ist steil genug zum Drucken, die Spitzen sind Pyramiden.
   - Die Steinbögen der Portale liegen innerhalb der Länge: Tunnel und Portale lassen sich direkt aneinanderreihen.
   - Der Kurventunnel deckt genau eine große Kurve (R182, 45°) ab.
   - Auch der Lokschuppen bekommt diese Öffnung statt der alten mit 28 mm flacher Decke. Er ist deshalb höher.
5. **Noppen je Seite** (`StudSides`, Projektdatei-Version 3):
   - Links und rechts getrennt: keine, LEGO oder DUPLO, mit beliebig vielen Reihen bis 96 mm Leiste (LEGO 12, DUPLO 6 Reihen).
   - In Kurven läuft jede Reihe auf ihrem eigenen Bogen, im Noppenraster dieses Bogens, so passen lange Steine auf eine Reihe.
   - Alte Dateien (eine Art, Seite, Reihen) werden beim Laden umgerechnet.
   - Neu: LEGO- und DUPLO-Platten als eigene Teile.
6. **Stellweiche** (`core/lever.ts`, Schalter „Stellhebel“ bei Weiche und Y-Weiche):
   - An der Weichenspitze laufen die Rillen auf einer Seite ineinander. Die Zunge eines Schiebers füllt den Teil der breiten Rille, den nur die andere Route nutzt.
   - Beide Teile haben die gleiche Form, eine Rille minus die andere. Deshalb genügt ein gerades Verschieben um eine Rillenbreite (6 mm), ohne Drehpunkt und ohne biegsame Zunge.
   - Ein Steg verbindet die Zunge mit einem Arm unter der Rille. Der Arm verlässt die Weiche seitlich durch einen Schlitz und endet in einem Griff.
   - Unter einer offenen Rille bleibt der Arm 0,6 mm unter dem Rillengrund, die Räder rollen darüber. Der Schlitz im Rillengrund ist 4,4 mm lang.
   - Der Schieber ist ein eigenes Druckteil und wird kopfüber gedruckt. Der Arm überbrückt dabei etwa 6 mm.
   - Die Weiche wird ohne untere Rillen gebaut und nicht gewendet; gespiegelt gebraucht ist sie ein eigenes Druckteil.
7. **Details, aber druckbar:**
   - **Dampfloks:** Kesselringe, Sanddom, Zylinder, Rauchkammertür, runde Führerhausfenster, Pfeife.
   - **Dieselloks:** Lüftergitter, Lüfter, Auspuff, Griffstange, Türen.
   - **E-Loks und Schnellzüge:** Türen, Zierleiste, Dachkästen. Der Stromabnehmer öffnet sich als V mit 45°.
   - **Wagen:** Bretterfugen und Türschiene, Eisluken, Ofenrohr, Türfenster, Zierlinie, Dachlüfter, Ringe am Kesselwagen, Rippen am Schüttgutwagen, Bodenbretter.
   - **Fahrgestell:** Achslager und Blattfedern, bei Dampfloks Kuppelstangen.
   - **Gebäude:** Fensterkreuze, Türrahmen, Gesimse mit 45°-Schräge, Dachziegel als Stufen, Uhr, Bänke, Laternen, Blumenkästen, Außentreppe am Stellwerk.
   - Regeln: Reliefs stehen höchstens 0,8 bis 1,5 mm ab. Größere Teile haben darunter eine 45°-Schräge, Öffnungen enden in einer 45°-Spitze. Die CyberBrick-Karosserie bekommt innen eine 45°-Decke.
8. **Druckbarkeits-Prüfung** (`geometry/printability.ts`):
   - Jedes Druckteil wird in seiner Druckrichtung in Schichten von 0,4 mm geschnitten.
   - Eine Schicht darf über die Schicht 2 mm tiefer höchstens 2 mm hinausragen (45°). Dazu kommen Brücken bis 8 mm, die auf beiden Seiten aufliegen, und Kanten bis 4 mm.
   - Was weiter hinausragt, ist Überhang (mm²).
   - Die Tests prüfen alle Schienen, Schieber, Stützen, jedes Fahrzeug (getrennt und einteilig) und jedes Gebäude in Standard-, kleinster und größter Größe: höchstens 20 mm².
   - Gefunden und behoben:
     - Stromabnehmer-Bügel (14 mm flach).
     - CyberBrick-Decke (29 mm).
     - Prellbock-Balken.
     - Kranhaken.
     - Flache Decken in den Rampen: Unter dem Gleis endet der Hohlraum jetzt in einem 45°-Grat.
   - Bekannte Ausnahme: Der Zapfen am hohen Ende einer Rampe ragt 17 mm frei hinaus. Eine Stütze darunter würde mit dem nächsten Teil kollidieren.

## Folgen

- Projektdatei-Version 3. Ältere Dateien lassen sich weiter öffnen.
- Mehr Druckteile (Schieber, Dächer) und ein höherer Lokschuppen.
- Die Prüfung läuft bisher nur in den Tests, nicht im Tool. Sie für vom Nutzer veränderte Teile in der Übersicht anzuzeigen, wäre der nächste Schritt (Rechenzeit bis 2 s je Kurventeil).
- Testdruck nötig:
  - Stellweiche: Spiel 0,4 mm, Halt des Schiebers, Räder über dem Schlitz.
  - Tunnel und Bahnhofshalle als große Teile.
  - Zapfen an hohen Rampenenden.
  - Viele Noppenreihen: Klemmkraft und Verzug breiter Leisten.
