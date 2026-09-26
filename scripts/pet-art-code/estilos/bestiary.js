// Estilo A · Bestiario de libro, desarrollado: 3 etapas × 6 clases × 6 expresiones, con grupos
// animables (#g-body, #g-head, #g-tail, #g-hand). Geometría base en squirrel.js.
(function (G) {
  "use strict";
  const S = G.SQUIRREL;
  const byId = Object.fromEntries(S.PARTS.map((p) => [p.id, p]));
  const INK = "#3b2716", SHADOW = "#6b4a2e", BG = "#efe2c2";
  const PAL = {
    fur: "#b9743f", furLight: "#e3c08c", furDark: "#7e4524", cream: "#f0dcb2", creamGrey: "#dcd3c0", earIn: "#d99b86",
    leather: "#7b5534", leatherDark: "#5a3b22", metal: "#c7a14a", steel: "#a7a699", steelDark: "#77766c", wood: "#8a6a42", woodDark: "#5e4428",
    // tonos por clase (acuarela gastada)
    cape: "#5d7358", tunic: "#a88a58", scarf: "#94412f",
    wiz: "#4f6384", wizDark: "#3b4a66", purple: "#6d5a80", crystal: "#9b86c4",
    red: "#94412f", white: "#efe6d2", bone: "#e8dcc0", greyFur: "#8f8778", wine: "#7d3342", green: "#5d7358", greenLight: "#8a9a6e",
  };
  let uid = 0;
  const part = (d, tone, sh = false, extra = {}) => ({ d, tone, sh, ...extra });
  const P = (id, over = {}) => ({ ...byId[id], sh: ["tail", "torso", "legNear", "legFar", "head", "capeBack", "bag", "armNear", "armFar"].includes(id), ...over });

  // Brazo cercano extendido hacia delante (para sostener arma a la izquierda de la cara)
  const ARM_OUT = part("M160,194 C138,206 110,234 96,256 C90,266 98,278 108,274 L116,264 C126,246 148,222 170,204 Z", "fur", true);
  const HAND_OUT = part("M88,262 C94,254 108,256 110,266 C112,276 102,284 94,280 C86,276 84,268 88,262 Z", "furDark");
  const HAND = [99, 269]; // punto de agarre

  // ---------- equipo por clase ----------
  const CLASS = {
    ranger: {
      name: "Exploradora", tones: { cape: "green", tunic: "tunic", scarf: "scarf" }, armOut: true,
      back: [part("M244,120 L266,128 L256,210 L236,204 Z", "leather", true), part("M246,118 l4,-26 M254,120 l6,-24 M262,124 l8,-22", "none", false, { line: true }),
        part("M246,94 l-4,-8 l8,2 Z M256,96 l-2,-9 l8,4 Z M266,100 l0,-9 l7,6 Z", "red")],
      hood: part("M146,164 C136,184 150,200 176,200 L226,200 C252,198 260,180 250,160 C236,172 170,176 146,164 Z", "green", true),
      weapon: [part("M98,118 C70,170 66,300 100,420 L106,418 C74,300 78,172 104,120 Z", "wood", true), part("M101,120 L103,420", "none", false, { line: true, w: 1 })],
    },
    wizard: {
      name: "Maga", tones: { cape: "purple", tunic: "wiz", scarf: "purple" }, armOut: true, noBag: true,
      over: [part("M160,186 C144,262 132,382 122,472 L268,472 C258,382 250,262 236,186 C212,196 184,196 160,186 Z", "wiz", true, { stars: true })],
      hat: [part("M122,78 C150,62 232,58 262,72 C254,86 146,92 122,78 Z", "wizDark", true), part("M150,72 C164,52 176,30 190,14 C200,4 222,-2 246,6 C226,10 212,22 210,40 C208,52 220,62 236,70 Z", "wiz", true), part("M156,70 C182,66 214,66 236,68 L234,60 C212,58 180,58 160,62 Z", "metal")],
      weapon: [part("M94,70 C98,150 92,260 100,500 L108,500 C100,260 106,150 102,70 Z", "wood", true), part("M98,34 L112,58 L98,84 L84,58 Z", "crystal", true), part("M92,76 C86,84 88,92 96,90 M104,76 C112,84 110,92 102,90", "none", false, { line: true })],
    },
    fighter: {
      name: "Guerrera", tones: { cape: "red", tunic: "tunic", scarf: "red" }, armOut: true, noBag: true,
      over: [part("M160,188 C148,222 150,262 160,292 L240,292 C250,262 250,224 236,188 C214,198 182,198 160,188 Z", "steel", true), part("M198,198 L198,286", "none", false, { line: true })],
      front: [part("M262,254 m-46,0 a46,46 0 1,0 92,0 a46,46 0 1,0 -92,0 Z", "wood", true), part("M262,254 m-46,0 a46,46 0 1,0 92,0 a46,46 0 1,0 -92,0 Z M262,254 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0 Z", "steel", false, { rule: "evenodd" }), part("M262,254 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0 Z", "metal", true)],
      hat: [part("M142,98 C142,62 196,46 240,66 C254,76 256,90 254,100 C220,92 176,92 142,98 Z", "steel", true), part("M176,98 L186,98 L184,124 L178,124 Z", "steelDark"), part("M188,56 C210,20 262,22 290,52 C270,44 244,44 226,58 Z", "red", true)],
      weapon: [part("M92,254 L106,254 L104,108 L99,92 L94,108 Z", "steel", true), part("M80,256 L118,256 L118,264 L80,264 Z", "metal"), part("M96,264 L102,264 L102,286 L96,286 Z", "leatherDark"), part("M99,112 L99,248", "none", false, { line: true, w: 0.8 })],
    },
    barbarian: {
      name: "Bárbara", tones: { cape: "greyFur", tunic: "leather", scarf: "leather" }, armOut: true, noBag: true, noScarf: true,
      over: [part("M142,172 L240,172 L258,196 L246,194 L250,214 L236,204 L232,224 L220,208 L210,228 L200,210 L188,230 L180,208 L168,226 L164,204 L150,216 L154,196 L138,202 Z", "greyFur", true, { fur: true })],
      hat: [part("M144,96 C146,64 196,52 238,68 C252,78 254,92 252,100 C218,92 178,92 144,96 Z", "steel", true),
        part("M150,86 C126,82 110,58 120,30 C128,52 142,64 160,70 Z", "bone", true), part("M236,80 C262,76 276,52 268,26 C260,48 246,60 228,66 Z", "bone", true)],
      paint: true,
      weapon: [part("M95,110 L103,110 L106,420 L98,420 Z", "wood", true), part("M96,128 C60,108 36,138 42,186 C58,168 76,160 98,164 Z", "steel", true), part("M104,130 C122,124 132,136 130,150 C120,146 112,148 104,152 Z", "steel", true)],
    },
    cleric: {
      name: "Clériga", tones: { cape: "white", tunic: "white", scarf: "metal" }, armOut: true, noBag: true, noScarf: true,
      back: [part("M150,150 C150,190 250,190 256,150 C262,176 250,204 200,206 C160,206 144,186 150,150 Z", "white", true)],
      over: [part("M160,186 C146,262 136,382 128,472 L266,472 C258,382 250,262 236,186 C212,196 184,196 160,186 Z", "white", true), part("M152,300 C182,310 222,310 250,298", "none", false, { line: true, w: 3, col: "#8a6a42" })],
      pendant: true,
      weapon: [part("M96,140 L103,140 L104,330 L97,330 Z", "wood", true), part("M99.5,128 m-18,0 a18,18 0 1,0 36,0 a18,18 0 1,0 -36,0 Z", "metal", true), part("M99.5,104 L104,116 L95,116 Z M99.5,152 L104,140 L95,140 Z M76,128 L88,124 L88,132 Z M123,128 L111,124 L111,132 Z", "metal")],
    },
    bard: {
      name: "Barda", tones: { cape: "wine", tunic: "wine", scarf: "metal" }, armOut: false,
      over: [part("M160,188 C148,222 150,262 160,292 L240,292 C250,262 250,224 236,188 C214,198 182,198 160,188 Z", "wine", true), part("M150,196 m-16,0 a16,14 0 1,0 32,0 a16,14 0 1,0 -32,0 Z", "metal", true), part("M244,196 m-15,0 a15,13 0 1,0 30,0 a15,13 0 1,0 -30,0 Z", "metal", true)],
      hat: [part("M142,84 C150,58 222,50 250,74 C240,90 166,94 142,84 Z", "wine", true), part("M236,70 C262,50 292,30 318,4 C300,34 276,58 244,80 Z", "bone", true), part("M242,72 C270,48 296,26 316,8", "none", false, { line: true })],
      lute: [part("M120,212 L132,202 L196,262 L186,272 Z", "woodDark", true), part("M108,196 L126,190 L134,206 L118,214 Z", "woodDark"),
        part("M204,286 m-40,0 a40,30 -35 1,0 80,0 a40,30 -35 1,0 -80,0 Z", "wood", true), part("M204,280 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 Z", "leatherDark"), part("M124,204 L214,290", "none", false, { line: true, w: 0.9 })],
    },
  };

  // ---------- etapas ----------
  const STAGE = {
    young: { name: "Cría", body: 0.8, head: 1.22, extras: false },
    adult: { name: "Adulta", body: 1, head: 1, extras: false },
    veteran: { name: "Veterana", body: 1.03, head: 1, extras: true },
  };

  // ---------- expresiones ----------
  const EXPR = {
    neutral: { name: "Pícara" },
    happy: { name: "Contenta" },
    sleepy: { name: "Adormilada" },
    sad: { name: "Triste" },
    angry: { name: "Furiosa" },
    ko: { name: "KO" },
  };

  function shade(p, dx, dy, fill, extra = "") {
    const id = "bm" + (uid++);
    return `<mask id="${id}" maskUnits="userSpaceOnUse" x="-60" y="-60" width="520" height="640"><path d="${p.d}" fill="#fff"/><path d="${p.d}" fill="#000" transform="translate(${dx},${dy})"/></mask><path d="${p.d}" fill="${fill}" mask="url(#${id})" ${extra}/>`;
  }
  function draw(p, tones = {}) {
    if (p.line) return `<path d="${p.d}" fill="none" stroke="${p.col || INK}" stroke-width="${p.w || 1.3}" stroke-linecap="round"/>`;
    const col = PAL[tones[p.tone] || p.tone] || PAL[p.tone];
    let s = `<path d="${p.d}" fill="${col}" ${p.rule ? `fill-rule="${p.rule}"` : ""}/>`;
    if (p.sh) s += shade(p, -9, -8, "url(#b-hatch)") + (p.sh2 ? shade(p, -16, -12, "url(#b-hatch2)") : "");
    if (p.stars) for (const [x, y] of [[176, 250], [214, 300], [168, 370], [236, 400], [196, 440], [150, 430], [240, 230]]) s += `<path d="M${x},${y - 5} L${x + 1.5},${y - 1.5} L${x + 5},${y} L${x + 1.5},${y + 1.5} L${x},${y + 5} L${x - 1.5},${y + 1.5} L${x - 5},${y} L${x - 1.5},${y - 1.5} Z" fill="${PAL.metal}" stroke="${INK}" stroke-width=".8"/>`;
    if (p.fur) for (let i = 0; i < 14; i++) { const x = 150 + i * 7, y = 182 + (i % 3) * 6; s += `<path d="M${x},${y} q3,8 1,16" stroke="${INK}" stroke-width="1" fill="none" opacity=".7"/>`; }
    s += `<path d="${p.d}" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linejoin="round" ${p.rule ? `fill-rule="${p.rule}"` : ""}/>`;
    return s;
  }

  function face(expr, vet) {
    const F = S.FACE;
    let s = "";
    const eyeW = "#f7ecd2";
    const closedArc = (a, b, c, d, up) => `<path d="M${a},${b} Q${(a + c) / 2},${up} ${c},${d}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    if (expr === "blink") s += closedArc(140, 110, 170, 108, 114) + closedArc(190, 105, 216, 103, 108);
    else if (expr === "happy") s += closedArc(140, 112, 170, 110, 100) + closedArc(190, 107, 216, 104, 96);
    else if (expr === "sleepy") s += closedArc(140, 110, 170, 110, 116) + closedArc(190, 105, 216, 104, 111) + `<path d="M142,108 L168,106 M192,103 L214,101" stroke="${INK}" stroke-width="1.2"/>`;
    else if (expr === "ko") s += `<path d="M146,104 L164,118 M164,104 L146,118 M196,98 L212,112 M212,98 L196,112" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    else {
      for (const [eye, iris, lid] of [[F.eyeNear, F.irisNear, "M140,114 C146,103 162,101 170,108"], [F.eyeFar, F.irisFar, "M190,108 C196,99 209,98 216,104"]]) {
        const id = "be" + (uid++);
        const [x, y, r] = iris;
        s += `<clipPath id="${id}"><path d="${eye}"/></clipPath><path d="${eye}" fill="${eyeW}"/><g clip-path="url(#${id})"><circle cx="${x}" cy="${y + (expr === "sad" ? 2 : 0)}" r="${r}" fill="#4e3219"/><circle cx="${x}" cy="${y + (expr === "sad" ? 2 : 0)}" r="${r * 0.45}" fill="${INK}"/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.5" fill="#fff"/>`;
        if (expr === "sad") s += `<path d="${eye}" fill="${PAL.fur}" transform="translate(0,-6)"/>`;
        s += `</g><path d="${eye}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="${lid}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
      }
    }
    // cejas según expresión
    const bc = vet ? "#e9e2d2" : INK, bs = vet ? `stroke="${INK}" stroke-width=".8"` : "";
    const brows = {
      neutral: [S.FACE.browNear, S.FACE.browFar],
      happy: ["M136,98 C146,86 164,84 174,92 C162,90 150,92 136,98 Z", "M188,90 C196,80 212,78 222,86 C210,84 200,85 188,90 Z"],
      sleepy: ["M136,104 C146,98 164,97 174,102 C162,101 150,102 136,104 Z", "M188,99 C196,94 212,93 222,97 C210,96 200,97 188,99 Z"],
      sad: ["M136,96 C146,96 162,90 172,82 C164,92 150,98 136,96 Z", "M190,82 C198,88 212,92 220,94 C210,96 198,92 190,82 Z"],
      angry: ["M134,90 C146,94 162,100 176,106 C160,106 146,100 134,90 Z", "M186,104 C196,98 210,92 224,86 C214,96 200,104 186,104 Z"],
      ko: [S.FACE.browNear, S.FACE.browFar],
      blink: [S.FACE.browNear, S.FACE.browFar],
    }[expr];
    for (const b of brows) s += `<path d="${b}" fill="${bc}" ${bs}/>`;
    const [nx, ny, rx, ry] = F.nose;
    s += `<ellipse cx="${nx}" cy="${ny}" rx="${rx}" ry="${ry}" fill="${INK}"/><ellipse cx="${nx - 2}" cy="${ny - 1.6}" rx="1.8" ry="1" fill="#fff" opacity=".7"/>`;
    const mouths = {
      neutral: `<path d="${F.tooth}" fill="#fff" stroke="${INK}" stroke-width="1.2"/><path d="${F.mouth}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
      happy: `<path d="M118,144 C126,160 146,160 154,138 C140,146 128,148 118,144 Z" fill="#7a2f28" stroke="${INK}" stroke-width="1.8"/><path d="M124,146 L130,147 L129,152 L124,151 Z" fill="#fff" stroke="${INK}" stroke-width="1"/>`,
      sleepy: `<ellipse cx="134" cy="148" rx="4" ry="3" fill="#7a2f28" stroke="${INK}" stroke-width="1.6"/>`,
      sad: `<path d="M120,152 C128,145 140,145 150,150" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M160,122 C158,128 162,132 164,128 C166,124 162,122 160,122 Z" fill="#9ec4d4" stroke="${INK}" stroke-width=".8"/>`,
      angry: `<path d="M118,146 L152,142 L150,152 L120,154 Z" fill="#7a2f28" stroke="${INK}" stroke-width="1.8"/><path d="M122,146 L150,143 L149,147 L122,149 Z" fill="#fff"/>`,
      ko: `<path d="M120,148 C130,152 142,152 150,146" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M130,151 C130,160 140,160 140,151 Z" fill="#c9606a" stroke="${INK}" stroke-width="1.2"/>`,
    };
    s += mouths[expr === "blink" ? "neutral" : expr];
    for (const w of F.whiskers) s += `<path d="${w}" stroke="${INK}" stroke-width="1.1" opacity=".8"/>`;
    return s;
  }

  function defs() {
    return `<defs>
      <pattern id="b-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="1.1" opacity=".75"/></pattern>
      <pattern id="b-hatch2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="1" opacity=".6"/></pattern>
      <filter id="b-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3"/></filter>
      <filter id="b-wash"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="9" result="n"/><feColorMatrix in="n" type="saturate" values="0" result="g"/><feComposite in="SourceGraphic" in2="g" operator="arithmetic" k1=".3" k2=".86" k3="0" k4="0"/></filter>
    </defs>`;
  }

  // Composición. Devuelve SVG con grupos animables.
  function svg({ stage = "adult", cls = "ranger", expr = "neutral", bg = true, caption = true, ink = true } = {}) {
    const st = STAGE[stage], c = CLASS[cls], vet = st.extras, tones = c.tones;
    const L = (arr) => (arr || []).map((p) => draw(p, tones)).join("");
    const lines = (arr, w = 1.3, op = 0.85) => arr.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`).join("");
    const hasBag = !c.noBag && stage !== "young";

    // cola
    let tail = draw(P("tail", { sh2: true }), tones) + draw(P("tailIn"), tones);
    if (vet) tail += `<path d="M252,42 C222,50 212,82 232,94 C248,104 262,88 258,74 C250,60 262,48 280,46 C270,40 260,40 252,42 Z" fill="${PAL.creamGrey}" stroke="${INK}" stroke-width="1.6"/>`;
    tail += lines(S.DETAIL.slice(28, 37), 1.1, 0.75);

    // cuerpo
    let body = L(c.back);
    body += draw(P("capeBack", { sh2: true }), tones);
    body += draw(P("legFar"), tones) + draw(P("bootFar"), tones);
    if (!c.front) body += draw(P("armFar"), tones) + draw(P("handFar"), tones);
    body += draw(P("torso", { sh2: true }), tones) + draw(P("chest"), tones) + draw(P("belt"), tones) + draw(P("buckle"), tones);
    body += draw(P("legNear"), tones) + draw(P("bootNear"), tones);
    body += L(c.over);
    if (c.front) body += L(c.front);
    if (hasBag) body += draw(P("strap"), tones) + draw(P("bag"), tones) + draw(P("bagFlap"), tones) + S.STITCH.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-dasharray="3 3"/>`).join("");
    if (c.pendant) body += `<circle cx="198" cy="232" r="11" fill="${PAL.metal}" stroke="${INK}" stroke-width="1.8"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M198,232 l0,-17" stroke="${INK}" stroke-width="1.4" transform="rotate(${a} 198 232)"/>`).join("") + `<circle cx="198" cy="232" r="6" fill="${PAL.cream}" stroke="${INK}" stroke-width="1.2"/>`;
    if (cls !== "wizard" && cls !== "cleric") body += draw(P("capeFront"), tones);
    if (vet) body += `<path d="M162,186 C186,196 212,196 234,186" fill="none" stroke="${PAL.metal}" stroke-width="3"/>`;
    body += lines(S.DETAIL.slice(0, 3)) + lines(S.DETAIL.slice(10, 17));
    if (c.lute) body += L(c.lute);

    // brazo y arma
    let hand = "";
    if (c.armOut) hand = L(c.weapon) + draw(ARM_OUT, tones) + draw(HAND_OUT, tones) + lines(["M92,266 l8,1", "M92,272 l8,2"], 1.1);
    else hand = draw(P("armNear"), tones) + draw(P("handNear"), tones) + lines(S.DETAIL.slice(17, 20), 1.1);
    if (c.hood) body += draw(c.hood, tones);
    if (!c.noScarf) hand += draw(P("scarf"), tones) + draw(P("scarfTail"), tones) + lines(S.DETAIL.slice(3, 7));

    // cabeza
    let head = draw(P("earFar"), tones) + draw(P("earFarIn"), tones);
    head += draw(P("head", { sh2: false }), tones) + draw(P("brow"), tones);
    head += draw(P("muzzle", vet ? { tone: "creamGrey" } : {}), tones);
    head += draw(P("earNear"), tones) + draw(P("earNearIn"), tones);
    head += `<path d="${S.FACE.tuftFar}" fill="${INK}"/><path d="${S.FACE.tuftNear}" fill="${INK}"/>`;
    head += lines(S.DETAIL.slice(22, 26), 1.1, 0.8);
    head += face(expr, vet);
    if (c.paint) head += `<path d="M206,138 l14,-6 M208,146 l14,-6" stroke="${PAL.red}" stroke-width="3.2" stroke-linecap="round"/>`;
    if (vet) head += `<path d="M216,118 l10,12" stroke="${INK}" stroke-width="1.8"/>` + // cicatriz
      `<circle cx="156" cy="111" r="15" fill="#fff" fill-opacity=".12" stroke="${INK}" stroke-width="2.2"/><circle cx="204" cy="106" r="12" fill="#fff" fill-opacity=".12" stroke="${INK}" stroke-width="2.2"/><path d="M171,109 Q180,104 192,106 M216,104 L240,100" stroke="${INK}" stroke-width="2" fill="none"/>`;
    head += L(c.hat);

    // Etapa: cuerpo escalado desde los pies; cabeza escalada desde el cuello y recolocada
    const neck = [196, 176], feet = [196, 502];
    const nY = feet[1] - (feet[1] - neck[1]) * st.body;
    const bodyT = `translate(${feet[0]},${feet[1]}) scale(${st.body}) translate(${-feet[0]},${-feet[1]})`;
    const headT = `translate(${neck[0]},${nY}) scale(${st.head * st.body}) translate(${-neck[0]},${-neck[1]})`;

    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520">${defs()}`;
    if (bg) out += `<rect width="400" height="520" fill="${BG}"/><ellipse cx="206" cy="504" rx="${120 * st.body}" ry="10" fill="${SHADOW}" opacity=".18"/>`;
    out += `<g ${ink ? 'filter="url(#b-ink)"' : ""}><g filter="url(#b-wash)">`;
    out += `<g id="g-tail" transform="${bodyT}"><g class="tail">${tail}</g></g>`;
    out += `<g id="g-body" transform="${bodyT}"><g class="body">${body}</g></g>`;
    out += `<g id="g-head" transform="${headT}"><g class="head">${head}</g></g>`;
    out += `<g id="g-hand" transform="${bodyT}"><g class="hand">${hand}</g></g>`;
    out += `</g></g>`;
    if (bg && caption) out += `<text x="200" y="514" text-anchor="middle" font-family="'IM Fell English', Georgia, serif" font-style="italic" font-size="14" fill="${INK}">Sciurus viator · ${c.name.toLowerCase()} ${st.name.toLowerCase()}</text>`;
    return out + `</svg>`;
  }

  G.BESTIARY = { svg, CLASS, STAGE, EXPR, HAND, INK, BG };
})(typeof window !== "undefined" ? window : globalThis);
