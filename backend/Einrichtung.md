# Baustellen-App – Einrichtung

Dauer: etwa 10 Minuten. Alles kostenlos.

## A · Backend bei Google (einmalig)

1. **script.google.com** öffnen → **Neues Projekt** → oben links den Namen auf **Baustellen-Backend** ändern.
2. Den gesamten Inhalt von `Code.gs` im Editor durch die Datei **Code.gs** ersetzen → Speichern (Strg+S).
3. Links **Projekteinstellungen** (Zahnrad) → **Zeitzone** auf *(GMT+01:00) Berlin* stellen.
4. Zurück zum **Editor** → oben in der Funktionsauswahl **einrichten** wählen → **Ausführen**.
   - Google fragt nach Berechtigungen → **Berechtigungen prüfen** → dein Konto wählen.
   - Bei „Google hat diese App nicht überprüft“: **Erweitert** → **Zu Baustellen-Backend wechseln** → **Zulassen**. Das ist bei eigenen Skripten normal.
5. Im **Ausführungsprotokoll** unten stehen der Link zur neuen Tabelle „Baustellen“ und der **Einrichtungscode** (8 Zeichen, 24 Stunden gültig). Den Code notieren.
6. Oben rechts **Bereitstellen** → **Neue Bereitstellung** → Zahnrad → **Web-App**:
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
   - **Bereitstellen** → die **Web-App-URL** (endet auf `/exec`) kopieren.

## B · App öffnen und Konto anlegen

7. Die App-Adresse öffnen (siehe unten) → Web-App-URL einfügen → **Verbinden**.
8. **Konto anlegen**: Name, Mailadresse, Passwort (mind. 8 Zeichen), Einrichtungscode → speichern.
9. **PIN** festlegen (4 Ziffern).
10. Auf dem Handy: Seite im Browser öffnen → Teilen-Menü → **Zum Home-Bildschirm** (iPhone) bzw. **App installieren** (Android).
11. Weitere Geräte: dieselbe Adresse öffnen, Web-App-URL eintragen, mit Mail und Passwort **anmelden**.

## Gut zu wissen

- **Passwort vergessen:** Im Skript-Editor `neuerEinrichtungscode` ausführen. In der App „Konto mit Einrichtungscode anlegen / Passwort vergessen“ wählen und mit dem Code ein neues Passwort setzen.
- **PIN vergessen:** In der PIN-Abfrage „Vergessen?“ antippen und neu anmelden. Die Daten bleiben erhalten.
- **Tabelle:** Die Blätter nicht umbenennen und keine Spalten löschen oder verschieben. Direkte Änderungen an Werten kommen beim nächsten Abgleich in der App an.
- **Fotos** liegen im Drive-Ordner „Baustellen-Fotos“ und sind nicht öffentlich.
- **Neue Fassung des Backends:** Code ersetzen → **Bereitstellen** → **Bereitstellungen verwalten** → Stift → Version **Neue Version** → **Bereitstellen**. Die URL bleibt gleich.
- **Sicherung:** Die Google-Tabelle hat einen Versionsverlauf. Zusätzlich gibt es in der App unter Einstellungen den Punkt **Daten exportieren**.
