package app.biblioshare.mobile.widgets

import android.content.Context
import app.biblioshare.mobile.auth.NativeSupabase

// Transporte de datos del widget (arquitectura híbrida, Fase 2). Antes la web
// EMPUJABA el snapshot (BiblioshareWidgetPlugin.updateSnapshot); ahora el widget
// lo PIDE a Supabase con la sesión nativa (Fase 1) llamando a la RPC
// get_widget_snapshot, que devuelve EXACTAMENTE el JSON v2 que el parser ya
// consume. Un único sitio hace fetch → persiste → repinta; lo llaman tanto el
// WorkManager (app cerrada) como el plugin (app en primer plano). No abre hilos:
// el llamante decide dónde corre (nunca el main thread — hay red de por medio).
object WidgetSync {
    private const val RPC = "get_widget_snapshot"

    enum class Result { OK, NO_SESSION, FAILED }

    fun refresh(context: Context): Result {
        // Sin sesión no hay a quién preguntar (y evita red inútil tras logout).
        if (!NativeSupabase.hasSession(context)) return Result.NO_SESSION
        val json = NativeSupabase.rpc(context, RPC) ?: return Result.FAILED
        // save valida versión/usuario y purga portadas si cambió de cuenta.
        val parsed = WidgetSnapshotStore.save(context, json) ?: return Result.FAILED
        WidgetRefresh.updateAll(context) // texto primero: nunca espera a una imagen
        downloadCovers(context, parsed) // portadas después, best-effort
        return Result.OK
    }

    /** Descarga las portadas del snapshot, purga las que sobran y repinta si bajó alguna. */
    fun downloadCovers(context: Context, parsed: WidgetSnapshot) {
        val covers = parsed.inProgress.mapNotNull { it.coverUrl }
        WidgetImageCache.prune(context, covers.toSet())
        var any = false
        covers.forEach { if (WidgetImageCache.ensureDownloaded(context, it)) any = true }
        if (any) WidgetRefresh.updateAll(context)
    }
}
