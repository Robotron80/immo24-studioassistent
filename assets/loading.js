// Ladefenster: Punkte animieren und Versionsnummer anzeigen.
// Eigene Datei statt Skript im HTML, weil die Content-Security-Policy nur Skriptdateien erlaubt.
const dots = document.querySelectorAll('.dot')
let step = 0
setInterval(() => {
  dots.forEach((dot, i) => dot.classList.toggle('active', i <= step))
  step = (step + 1) % dots.length
}, 400)

window.electronAPI?.getAppVersion?.().then((version) => {
  if (version) document.getElementById('version').textContent = 'v' + version
})
