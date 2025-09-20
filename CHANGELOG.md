# Changelog

Alle relevanten Änderungen werden in diesem Dokument festgehalten.

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