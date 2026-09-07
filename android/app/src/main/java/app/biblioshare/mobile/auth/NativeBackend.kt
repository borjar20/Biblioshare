package app.biblioshare.mobile.auth

/** The production wrapper must never send session credentials to a caller-selected project. */
internal object NativeBackend {
    const val ORIGIN = "https://vmutcradmodhiltuohys.supabase.co"

    fun acceptsBase(url: String) = url == ORIGIN || url == "$ORIGIN/"
    fun acceptsRequest(url: String) = url.startsWith("$ORIGIN/")
}
