package app.biblioshare.mobile.widgets

import android.content.Context

// Almacenamiento privado del snapshot: SharedPreferences con el JSON crudo.
// Solo texto pequeño — las portadas van a fichero (WidgetImageCache), nunca
// aquí. No hay tokens ni credenciales: el snapshot lo genera el servidor y
// solo contiene lo que el widget pinta más el userId para detectar cambios
// de cuenta.
object WidgetSnapshotStore {
    private const val PREFS = "biblioshare_widgets"
    private const val KEY_SNAPSHOT = "snapshot_json"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Valida, detecta cambio de usuario (y purga las portadas del anterior) y
     * persiste. Devuelve el snapshot parseado o null si era inválido (en cuyo
     * caso no se toca lo guardado).
     */
    fun save(context: Context, json: String): WidgetSnapshot? {
        val parsed = WidgetSnapshot.parse(json) ?: return null
        val previous = load(context)
        if (previous != null && previous.userId != parsed.userId) {
            WidgetImageCache.clear(context)
            TimerStore.clear(context, null)
        }
        prefs(context).edit().putString(KEY_SNAPSHOT, json).apply()
        return parsed
    }

    /** null = nunca sincronizado, sesión cerrada, o snapshot corrupto/incompatible. */
    fun load(context: Context): WidgetSnapshot? =
        WidgetSnapshot.parse(prefs(context).getString(KEY_SNAPSHOT, null))

    /** Cierre de sesión: fuera snapshot y fuera portadas. */
    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
        WidgetImageCache.clear(context)
    }
}
