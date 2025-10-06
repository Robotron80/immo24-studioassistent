# Changelog

Alle relevanten Änderungen werden in diesem Dokument festgehalten.

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