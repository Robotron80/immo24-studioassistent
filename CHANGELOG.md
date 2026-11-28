# Changelog

Alle relevanten Änderungen werden in diesem Dokument festgehalten.

## [v2026.11.0] - 2026-11-28

### Added
- **Projekte umbenennen**: Projektname und Mo-ID lassen sich nachträglich ändern. Ordner und Projektdatei werden angepasst, die Sessions bleiben unverändert.
  Das Modul ist standardmäßig deaktiviert und wird in der Konfiguration unter Module eingeschaltet. Solange eine Session des Projekts geöffnet ist, ist das Umbenennen gesperrt.
- **Mehrere Mo-IDs pro Projekt**: Ein Projekt kann mehrere Mo-IDs tragen, zum Beispiel für Kurz- und Langfassung (`AB12+CD34`).
- **Projekte ohne Mo-ID**: Es lassen sich Projekte ohne Mo-ID anlegen.
- **Doppelte Mo-ID**: Beim Anlegen wird geprüft, ob die Mo-ID beim selben Kunden schon vorhanden ist.
- **Anmerkungen in Sessionnamen**: Enthält das Session-Schema den Platzhalter `{{anmerkung}}`, erscheint ein optionales Feld für eine Anmerkung (zum Beispiel „Kurzversion“). Die Versionszählung berücksichtigt auch Sessions mit Anmerkung.
- **Standardvorlagen**: Ein optionaler Pfad für Vorlagen, die allen Mitarbeiter*innen zur Verfügung stehen. Sie erscheinen in der Vorlagenliste mit dem Zusatz „(Standard)“.
- **EventPipe-Ziel**: Ein Unterordner pro Kunde kann in der Konfiguration als Ziel für den Export aus immo24 EventPipe (coming soon) markiert werden.
- **Debug-Modus `--immo24-debug`**: Blendet das Entwickler-Menü mit der Konsole ein und protokolliert jeden Vorgang im Log.

### Changed
- **App**: Die App läuft jetzt ohne Node-RED und ohne lokalen Webserver, die Oberfläche spricht direkt mit der App.
- **Vorhandene Projekte**: Das neueste Projekt steht immer ganz oben (#1).
- **Eingaben aufräumen**: Die Mo-ID wird immer in Großbuchstaben geschrieben, Leerzeichen am Anfang und Ende von Name und Mo-ID werden entfernt (#3).
- **Admin-Passwort**: Es gibt kein Standardpasswort mehr. Das Passwort wird im Einrichtungsassistenten festgelegt. Ein vorhandenes Passwort aus 0.4 bleibt gültig.
- **Oberfläche**: Überarbeitet, Icons werden als Vektorgrafik gezeichnet und bleiben auch bei hoher Auflösung scharf.
- **Fehlende Quellordner**: Fehlt bei Store oder Recall ein Ordner, wird das als Teilerfolg gemeldet statt als Fehler.
- **Fehlermeldungen**: Jeder Vorgang liefert eine Antwort und eine verständliche Meldung, die App bleibt nicht mehr hängen.
- **Fehlende Ablageordner**: Fehlen bei der Anmeldung die persönlichen Ablageordner, werden sie angelegt.

### Fixed
- **Projektanlage**: Fehlte der Produktionen-Ordner, der Kundenordner oder hatte der Kunde keine Unterordner, blieb die App ohne Antwort hängen.
  Jetzt gibt es eine klare Meldung, ein fehlender Kundenordner wird angelegt. Bricht die Anlage ab, nennt die Meldung den unvollständigen Ordner.
- **Sessionnamen mit Punkt**: Namen wurden ab dem letzten Punkt abgeschnitten (aus `Spot v1.2` wurde `Spot v1.ptx`).
- **Kundennamen mit Doppelpunkt**: Kundenordner und Projektanlage verwendeten unterschiedliche Namen.
- **Keyboard Shortcuts**: Der Recall ist immer fehlgeschlagen, weil er aus einem falsch geschriebenen Ordner gelesen hat.
- **Fade Presets**: Ohne Quick-Presets wurde ein Fehler gemeldet, obwohl alles kopiert war. Fehlte beim Recall einer der Ordner im Archiv, galt die ganze Kategorie als fehlgeschlagen.
- **Presets ohne Auswahl**: Store und Recall ohne ausgewählte Kategorie blieben ohne Antwort hängen.
- **Mitarbeiter-Verwaltung**: Ein leerer Name blieb ohne Antwort hängen.

### Hinweise zum Update
- 0.4 und 2026.11 können während des Rollouts gleichzeitig auf demselben Speicher arbeiten.
- 0.4 zeigt Projekte ohne Mo-ID nicht an. Speichert man in 0.4 die Konfiguration, gehen dort die Markierung „EventPipe-Ziel“ und der Pfad für Standardvorlagen verloren.
- Der Ordner `node-red` im Einstellungsordner wird nicht mehr benötigt und kann gelöscht werden, sobald 0.4 auf dem Rechner nicht mehr gebraucht wird.

**Full Changelog**: [v0.4.0-beta...v2026.11.0](https://github.com/Robotron80/immo24-studioassistent/compare/v0.4.0-beta...v2026.11.0)

---

## [v0.4.0-beta] - 2025-10-06

### Added
- **Soundminer Modul**: Neues Modul zur Verwaltung und Bereitstellung von benutzerbezogenen Presets.  
  Aktuell sind **Tab-Layouts** verfügbar, ausschließlich kompatibel mit **Soundminer V6 Pro**.  
  Das Modul muss in der Konfiguration aktiviert werden und erscheint nur dann in der Oberfläche.  
- **Pro Tools Modul**: Hinzugefügt wurde ein **„Alles anwählen / abwählen“**-Button für eine schnellere Bedienung.  
- **Entwickler-Menü**: Im **Entwickler-Modus** steht nun ein Menü zur Verfügung, über das die **Konsole** zu Debugging-Zwecken geöffnet werden kann.  
- **Mitarbeiter-Verwaltung im Ersteinrichtungs-Assistenten**: Beim ersten Start können Mitarbeiter*innen direkt angelegt und verwaltet werden.  
  Mindestens eine Mitarbeiter*in muss bei der Ersteinrichtung angelegt werden.
  
### Changed
- **Mitarbeiter-Prüfung (Case-Insensitive)**: Beim Anlegen neuer Mitarbeiter*innen wird das Vorhandensein eines Eintrags jetzt **unabhängig von Groß- und Kleinschreibung** geprüft.  
- **Kunden-Prüfung (Case-Insensitive)**: Beim Anlegen neuer Kund*innen erfolgt die Prüfung ebenfalls **unabhängig von Groß- und Kleinschreibung**.  

### Fixed
- **Konfigurationsschema**: In der Konfiguration konnte das Schema versehentlich gelöscht werden.  
  Jetzt wird vor dem Speichern geprüft, dass ein **gültiges Schema** eingestellt ist.  
- **Pfadkonfiguration**: In der Konfiguration konnten die Pfade versehentlich gelöscht werden.  
  Jetzt wird vor dem Speichern geprüft, dass **gültige Pfade** angegeben sind.  
- **Fenstersteuerung beim Login**: Wurde die Konfiguration vor dem Login geöffnet und danach geschlossen, lief das Programm ohne Fenster weiter.  
  Jetzt öffnet sich in diesem Fall automatisch wieder das **Login-Fenster**.  
- **Ersteinrichtungs-Assistent**: Während der Ersteinrichtung konnte die Konfiguration geöffnet werden – das ist nun **gesperrt**, um unvollständige Setups zu verhindern.  

**Full Changelog**: [v0.3.0-beta...v0.4.0-beta](https://github.com/Robotron80/immo24-studioassistent/compare/v0.3.0-beta...v0.4.0-beta)

---


## [v0.3.0-beta] - 2025-09-21

### Added
- **Validierung von Dateinamen**: Prüfung auf verbotene Sonderzeichen in Datei- und Ordnernamen.  
- **Templates**: Unterstützung von Templates mit Clips/Medien.  

### Changed
- **Kundenliste**: Einträge werden jetzt standardmäßig alphabetisch sortiert.  

### Fixed
- **Plug-In Settings**: Problem behoben, bei dem der Recall von Plug-In Settings nicht funktioniert hat, wenn im lokalen Plug-In Ordner kein entsprechender User-Ordner angelegt war.  

**Full Changelog**: [v0.2.0-beta...v0.3.0-beta](https://github.com/Robotron80/immo24-studioassistent/compare/v0.2.0-beta...v0.3.0-beta)

---

## [v0.2.0-beta] - 2025-09-20

### Added
- **Ersteinrichtungs-Assistent**: Führt durch die initiale Konfiguration und richtet die Arbeitsumgebung ein.  
- **Pro Tools Modul**: Neues Modul zur Verwaltung und Bereitstellung von benutzerbezogenen Presets.  

### Changed
- Migration des Frontends von **Flowfuse Dashboard** zu **Vite + Vue + Vuetify** → moderner, performanter UI-Stack.  
- Strikte Trennung von Backend und Frontend durch eine klar definierte **REST-API-Schicht**.  
- Umfassende Refactorings: große Teile von Backend- und Frontend-Code wurden neu implementiert, um Wartbarkeit und Erweiterbarkeit zu verbessern.  

### Fixed
- Zahlreiche Fehlerkorrekturen in unterschiedlichen Modulen → deutlich gesteigerte **Stabilität**.  
- Verbesserte **Performance**: schnellere Reaktionszeiten der UI und insgesamt flüssigeres Arbeiten.  
- Behebung mehrerer Fehler, die zuvor zu inkonsistentem Verhalten geführt haben.  

**Full Changelog**: [v0.0.1-beta...v0.2.0-beta](https://github.com/Robotron80/immo24-studioassistent/compare/v0.0.1-beta...v0.2.0-beta)