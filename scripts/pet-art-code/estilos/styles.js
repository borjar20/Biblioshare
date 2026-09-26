// Cuatro direcciones de estilo sobre la misma geometría. style(key, {pixel}) -> SVG string.
// pixel:true quita texturas finas (tramas, temblor de tinta) para poder bajarlo a pixel art.
(function (G) {
  "use strict";
  const S = G.SQUIRREL;
  let uid = 0;

  // Sombra automática por parte: la forma menos ella misma desplazada hacia la luz.
  function shade(part, dx, dy, fill, extra = "") {
    const id = "m" + (uid++);
    return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="520"><path d="${part.d}" fill="#fff"/><path d="${part.d}" fill="#000" transform="translate(${dx},${dy})"/></mask><path d="${part.d}" fill="${fill}" mask="url(#${id})" ${extra}/>`;
  }
  const FACE = S.FACE;

  const STYLES = {
    bestiary: {
      name: "Bestiario de libro",
      blurb: "Lámina de un libro antiguo de criaturas: tinta sepia que tiembla un poco, sombreado a trazos cruzados y colores de acuarela gastada. Encaja con una app de lectura.",
      ink: "#3b2716",
      bg: "#efe2c2",
      pal: { fur: "#b9743f", furLight: "#e3c08c", furDark: "#7e4524", cape: "#5d7358", leather: "#7b5534", leatherDark: "#5a3b22", tunic: "#a88a58", cream: "#f0dcb2", metal: "#c7a14a", scarf: "#94412f", earIn: "#d99b86" },
      shadow: "#6b4a2e",
      render(o) {
        const P = this.pal, pix = o.pixel;
        let d = `<defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="${this.ink}" stroke-width="1.1" opacity=".75"/></pattern>
          <pattern id="hatch2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><line x1="0" y1="0" x2="0" y2="6" stroke="${this.ink}" stroke-width="1" opacity=".6"/></pattern>
          <filter id="wob"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter>
          <filter id="wash"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="9" result="n"/><feColorMatrix in="n" type="saturate" values="0" result="g"/><feComposite in="SourceGraphic" in2="g" operator="arithmetic" k1=".35" k2=".85" k3="0" k4="0"/></filter>
        </defs>`;
        let b = "";
        if (!o.nobg) b += `<rect width="400" height="520" fill="${this.bg}"/><ellipse cx="210" cy="502" rx="120" ry="10" fill="${this.shadow}" opacity=".18"/>`;
        let g = "";
        for (const p of S.PARTS) {
          g += `<path d="${p.d}" fill="${P[p.tone]}" ${pix ? "" : 'filter="url(#wash)"'}/>`;
          if (["tail", "torso", "legNear", "legFar", "head", "capeBack", "bag", "armNear", "armFar"].includes(p.id))
            g += pix ? shade(p, -8, -7, this.shadow, 'opacity=".55"') : shade(p, -9, -8, "url(#hatch)") + (["capeBack", "torso", "tail"].includes(p.id) ? shade(p, -16, -12, "url(#hatch2)") : "");
          g += `<path d="${p.d}" fill="none" stroke="${this.ink}" stroke-width="${pix ? 3 : 2.1}" stroke-linejoin="round"/>`;
        }
        g += details(this, 1.3, o, .85);
        g += face(this, { iris: "#4e3219", eyeW: "#f7ecd2", sw: pix ? 2.6 : 1.8 });
        // pelo del rabo a plumilla
        if (!pix) for (let i = 0; i < 16; i++) { const y = 70 + i * 16, x = 318 + Math.sin(i * 0.7) * 20; g += `<path d="M${x},${y} q10,-4 16,-12" fill="none" stroke="${this.ink}" stroke-width="1" opacity=".7"/>`; }
        if (!pix && !o.nobg) g += `<text x="200" y="514" text-anchor="middle" font-family="'IM Fell English', Georgia, serif" font-style="italic" font-size="15" fill="${this.ink}">Sciurus viator · lám. IV</text>`;
        return d + b + `<g ${pix ? "" : 'filter="url(#wob)"'}>${g}</g>`;
      },
    },
    folk: {
      name: "Folk / grabado",
      blurb: "Grabado en madera y arte popular: cuatro tintas, formas rotundas, sombras negras talladas con gubia y motivos de flor en la capa.",
      ink: "#17120f",
      stitch: "#f2e4c4",
      bg: "#f2e4c4",
      pal: { fur: "#c4532a", furLight: "#e9a24a", furDark: "#17120f", cape: "#1f4f4f", leather: "#17120f", leatherDark: "#c4532a", tunic: "#e9a24a", cream: "#f2e4c4", metal: "#e9a24a", scarf: "#c4532a", earIn: "#e9a24a" },
      render(o) {
        const P = this.pal, pix = o.pixel;
        let d = `<defs>
          <pattern id="gouge" width="10" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><path d="M1,3.5 q4,-2.4 8,0" stroke="${this.bg}" stroke-width="1.4" fill="none"/></pattern>
          <pattern id="flowers" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="${P.cape}"/><circle cx="13" cy="13" r="3" fill="${P.furLight}"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="13" cy="7.6" rx="2" ry="3.6" fill="${this.bg}" transform="rotate(${a} 13 13)"/>`).join("")}<circle cx="0" cy="0" r="1.6" fill="${P.fur}"/><circle cx="26" cy="26" r="1.6" fill="${P.fur}"/></pattern>
          <pattern id="chev" width="14" height="12" patternUnits="userSpaceOnUse"><rect width="14" height="12" fill="${P.fur}"/><path d="M0,9 L7,3 L14,9" stroke="${this.ink}" stroke-width="2" fill="none"/></pattern>
          <pattern id="zig" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="${P.tunic}"/><path d="M0,8 L3,2 L6,8 L9,2 L12,8" stroke="${P.fur}" stroke-width="2" fill="none"/></pattern>
        </defs>`;
        let b = "";
        if (!o.nobg) b += `<rect width="400" height="520" fill="${this.bg}"/><rect x="10" y="10" width="380" height="500" fill="none" stroke="${this.ink}" stroke-width="4"/><rect x="18" y="18" width="364" height="484" fill="none" stroke="${this.ink}" stroke-width="1.5"/>` +
          [[34, 34], [366, 34], [34, 486], [366, 486]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${P.fur}" stroke="${this.ink}" stroke-width="2"/>`).join("") + `<path d="M40,500 Q200,478 360,500" stroke="${this.ink}" stroke-width="3" fill="none"/>`;
        let g = "";
        for (const p of S.PARTS) {
          let f = P[p.tone];
          if (!pix && p.id === "capeBack") f = "url(#flowers)";
          if (!pix && p.id === "tail") f = "url(#chev)";
          if (!pix && p.id === "torso") f = "url(#zig)";
          g += `<path d="${p.d}" fill="${f}"/>`;
          if (["tail", "torso", "legNear", "legFar", "head", "armNear", "armFar", "capeBack"].includes(p.id)) { g += shade(p, -8, -7, this.ink); if (!pix) g += shade(p, -8, -7, "url(#gouge)"); }
          g += `<path d="${p.d}" fill="none" stroke="${this.ink}" stroke-width="${pix ? 4 : 3.6}" stroke-linejoin="miter"/>`;
        }
        g += details(this, 2.2, o);
        g += face(this, { iris: this.ink, eyeW: this.bg, sw: 3, flatEye: true });
        return d + b + g;
      },
    },
    anime: {
      name: "Anime de aventuras",
      blurb: "Sombreado de celda con sombra dura en violeta y luz de contorno, colores saturados y mirada afilada. Más cerca de un JRPG que de una peli de animación 3D.",
      ink: "#2a1420",
      bg: "#dfe9f2",
      pal: { fur: "#e5762f", furLight: "#ffd08a", furDark: "#7b2f28", cape: "#2c4f8a", leather: "#7a4a2c", leatherDark: "#4f2c1c", tunic: "#e9e2cf", cream: "#fff0d6", metal: "#ffcf4a", scarf: "#e23b3b", earIn: "#ff9fa0" },
      dark: { fur: "#a5402d", furLight: "#d99966", furDark: "#4f1c20", cape: "#1b2d5e", leather: "#4f2c1c", leatherDark: "#2e1812", tunic: "#a9a0b8", cream: "#d9b2a8", metal: "#c98a2a", scarf: "#9a2240", earIn: "#c96f86" },
      render(o) {
        const P = this.pal, D = this.dark, pix = o.pixel;
        let d = `<defs><radialGradient id="aglow" cx="55%" cy="40%" r="65%"><stop offset="0" stop-color="#fff7e0"/><stop offset="1" stop-color="${this.bg}"/></radialGradient>
          <linearGradient id="airis" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1a10"/><stop offset=".6" stop-color="#8a4a1c"/><stop offset="1" stop-color="#e0a040"/></linearGradient></defs>`;
        let b = "";
        if (!o.nobg) { b += `<rect width="400" height="520" fill="url(#aglow)"/>`; for (let i = 0; i < 9; i++) b += `<path d="M${-40 + i * 60},520 L${60 + i * 60},0" stroke="#fff" stroke-width="10" opacity=".35"/>`; b += `<ellipse cx="200" cy="502" rx="110" ry="9" fill="#5a4a7a" opacity=".3"/>`; }
        let g = "";
        for (const p of S.PARTS) {
          g += `<path d="${p.d}" fill="${P[p.tone]}"/>`;
          g += shade(p, -10, -6, D[p.tone]);
          if (!pix && ["tail", "head", "capeBack", "legNear", "armNear", "torso"].includes(p.id)) g += shade(p, 5, 4, "#fff", 'opacity=".35"');
          g += `<path d="${p.d}" fill="none" stroke="${this.ink}" stroke-width="${pix ? 3 : 2.4}" stroke-linejoin="round"/>`;
        }
        // mechón de flequillo entre las orejas
        g += `<path d="M178,70 L186,48 L192,66 L204,44 L204,70 Z" fill="${P.fur}" stroke="${this.ink}" stroke-width="2.4" stroke-linejoin="round"/>`;
        g += details(this, 1.4, o, .8);
        g += face(this, { iris: pix ? "#8a4a1c" : "url(#airis)", eyeW: "#fff", sw: 2.4, sharp: true });
        return d + b + g;
      },
    },
    ligne: {
      name: "Cómic europeo",
      blurb: "Línea clara al estilo del cómic franco-belga: contorno negro uniforme, colores planos sin sombras y toda la expresión en la pose y la cara.",
      ink: "#111111",
      bg: "#f4efe3",
      pal: { fur: "#e07b35", furLight: "#f6c27a", furDark: "#a44a22", cape: "#3b7a58", leather: "#8b5a34", leatherDark: "#6a3f22", tunic: "#4a78c2", cream: "#fbe3b8", metal: "#f2c230", scarf: "#e33b2e", earIn: "#f2a09a" },
      render(o) {
        const P = this.pal;
        let b = "";
        if (!o.nobg) b += `<rect width="400" height="520" fill="${this.bg}"/><rect x="24" y="24" width="352" height="472" fill="#bfe0ee" stroke="${this.ink}" stroke-width="3"/><rect x="24" y="380" width="352" height="116" fill="#d6c79a" stroke="${this.ink}" stroke-width="3"/><ellipse cx="200" cy="500" rx="92" ry="8" fill="#8a7a50"/>`;
        let g = "";
        for (const p of S.PARTS) g += `<path d="${p.d}" fill="${P[p.tone]}" stroke="${this.ink}" stroke-width="${o.pixel ? 3.4 : 2.8}" stroke-linejoin="round" stroke-linecap="round"/>`;
        g += details(this, 1.7, o);
        g += face(this, { iris: this.ink, eyeW: "#fff", sw: 2.4, dot: true });
        return b + g;
      },
    },
  };

  function details(st, w, o, op = 1) {
    if (o.pixel) return "";
    return S.DETAIL.map((d) => `<path d="${d}" fill="none" stroke="${st.ink}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`).join("") +
      S.STITCH.map((d) => `<path d="${d}" fill="none" stroke="${st.stitch || st.ink}" stroke-width="${w * 0.9}" stroke-dasharray="3 3"/>`).join("");
  }
  function face(st, o) {
    const F = FACE, ink = st.ink;
    let s = "";
    for (const [eye, iris] of [[F.eyeNear, F.irisNear], [F.eyeFar, F.irisFar]]) {
      const id = "e" + (uid++);
      s += `<clipPath id="${id}"><path d="${eye}"/></clipPath><path d="${eye}" fill="${o.eyeW}"/>`;
      const [x, y, r] = iris;
      if (o.dot) s += `<ellipse cx="${x}" cy="${y}" rx="${r * 0.62}" ry="${r * 0.8}" fill="${ink}" clip-path="url(#${id})"/>`;
      else if (o.flatEye) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}" clip-path="url(#${id})"/><circle cx="${x - 1.6}" cy="${y - 1.6}" r="1.5" fill="${o.eyeW}"/>`;
      else s += `<g clip-path="url(#${id})"><circle cx="${x}" cy="${y}" r="${r}" fill="${o.iris}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${ink}"/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.6" fill="#fff"/>${o.sharp ? `<circle cx="${x + 2}" cy="${y + 2}" r=".9" fill="#fff"/>` : ""}</g>`;
      s += `<path d="${eye}" fill="none" stroke="${ink}" stroke-width="${o.sw}" stroke-linejoin="round"/>`;
      if (o.sharp) s += `<path d="${eye.split(" C")[0]} C${eye.split(" C")[1]}" fill="none" stroke="${ink}" stroke-width="${o.sw + 1.6}" stroke-linecap="round"/>`;
    }
    s += `<path d="${F.browNear}" fill="${ink}"/><path d="${F.browFar}" fill="${ink}"/>`;
    const [nx, ny, rx, ry] = F.nose;
    s += `<ellipse cx="${nx}" cy="${ny}" rx="${rx}" ry="${ry}" fill="${ink}"/><ellipse cx="${nx - 2}" cy="${ny - 1.6}" rx="1.8" ry="1" fill="#fff" opacity=".7"/>`;
    s += `<path d="${F.tooth}" fill="#fff" stroke="${ink}" stroke-width="1.2"/><path d="${F.mouth}" fill="none" stroke="${ink}" stroke-width="${o.sw}" stroke-linecap="round"/>`;
    for (const w of F.whiskers) s += `<path d="${w}" stroke="${ink}" stroke-width="1.1" opacity=".8"/>`;
    s += `<path d="${F.tuftFar}" fill="${ink}"/><path d="${F.tuftNear}" fill="${ink}"/>`;
    return s;
  }

  function svg(key, o = {}) {
    const st = STYLES[key];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${S.VB}">${st.render(o)}</svg>`;
  }
  G.SQ_STYLES = { STYLES, svg };
})(typeof window !== "undefined" ? window : globalThis);
