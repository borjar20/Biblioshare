import { AppLogoIcon } from "./icons";

// El wordmark de la marca: la estantería + "Biblio" en texto y "share" en el
// acento. El corte del nombre no es decorativo — señala las dos mitades de la
// idea: la biblioteca (de todo) y el compartir.
export function Wordmark({
  size = "default",
  className = "",
}: {
  size?: "default" | "lg";
  className?: string;
}) {
  const isLarge = size === "lg";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <AppLogoIcon className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      <span
        className={`font-serif font-semibold tracking-tight ${
          isLarge ? "text-2xl" : "text-sm"
        }`}
      >
        Biblio<span className="text-accent">share</span>
      </span>
    </span>
  );
}
