/**
 * Gemeinsamer Ablauf aller Bereiche der Konfiguration (Pfade, Module, Namensschema,
 * Mitarbeiter, Kunden): Stand vom Speicher laden, eine Arbeitskopie bearbeiten und
 * erkennen, ob sich etwas geändert hat. Gespeichert wird erst in Konfiguration.vue bzw.
 * im Einrichtungsassistenten, die dafür getSnapshotForSave der Bereiche aufrufen.
 *
 * Ein "Composable" ist in Vue eine Funktion, die wiederverwendbare Logik samt
 * reaktiver Werte bündelt. Jeder Bereich ruft sie einmal auf.
 */
import { computed, onMounted, ref, type Ref } from 'vue'

/** Eine unabhängige Kopie, damit Änderungen an der Arbeitskopie den Originalstand nicht berühren */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export function useKonfigBereich<T>(options: {
  /** Leerer Anfangswert, bis der Stand vom Speicher da ist */
  empty: () => T
  /** Liest den Stand vom Speicher, schon umgewandelt in die Form, die die Oberfläche bearbeitet */
  load: () => Promise<{ data: T; version?: string | null }>
  /** Meldung, falls das Laden scheitert und das Backend keinen eigenen Text liefert */
  errorText: string
}) {
  // Stand vom Speicher und Arbeitskopie: Der Unterschied zeigt, ob etwas geändert wurde
  const original = ref({ data: options.empty(), version: '' }) as Ref<{ data: T; version: string }>
  const staged = ref(options.empty()) as Ref<T>
  const loading = ref(false)
  const error = ref('')
  const isDirty = computed(() => JSON.stringify(staged.value) !== JSON.stringify(original.value.data))

  /** Lädt den Stand vom Speicher und verwirft die Arbeitskopie. */
  async function reload() {
    loading.value = true
    error.value = ''
    try {
      const { data, version } = await options.load()
      original.value = { data, version: version ?? '' }
      staged.value = copy(data)
    } catch (e) {
      error.value = (e as Error)?.message || options.errorText
    } finally {
      loading.value = false
    }
  }
  onMounted(reload)

  return {
    original,
    staged,
    loading,
    error,
    isDirty,
    reload,
    /** Für defineExpose: was Konfiguration und Assistent bei jedem Bereich aufrufen */
    exposed: { isDirty: () => isDirty.value, resetToServer: reload },
  }
}
