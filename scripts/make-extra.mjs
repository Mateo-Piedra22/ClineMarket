// Generate the remaining 3 SVG mockups for README.md.
import { writeFileSync } from "node:fs";

const R = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
<rect width="1600" height="900" fill="#0e1117"/>
<rect x="0" y="0" width="1600" height="80" fill="#131820"/>
<text x="40" y="48" font-family="sans-serif" font-size="22" fill="#e6edf3" font-weight="700">\u2318 Cline Marketplace</text>
<rect x="0" y="80" width="1600" height="44" fill="#0d1218"/>
<text x="40" y="108" font-family="sans-serif" font-size="13" fill="#8b97a8">Catalog</text>
<text x="160" y="108" font-family="sans-serif" font-size="13" fill="#6aa9ff" font-weight="600">Recommended</text>
<line x1="156" y1="124" x2="270" y2="124" stroke="#6aa9ff" stroke-width="2"/>
<rect x="0" y="124" width="280" height="776" fill="#0f131a"/>
<line x1="280" y1="124" x2="280" y2="900" stroke="#2a313c"/>
<text x="20" y="160" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">PROJECT CONTEXT</text>
<rect x="20" y="172" width="160" height="22" rx="11" fill="#161b22" stroke="#3a4250"/>
<text x="100" y="187" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#e6edf3">Mateo-Piedra22/ClineMarket</text>
<rect x="20" y="200" width="60" height="22" rx="11" fill="#161b22" stroke="#3a4250"/>
<text x="50" y="215" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#8b97a8">typescript</text>
<rect x="86" y="200" width="60" height="22" rx="11" fill="#161b22" stroke="#3a4250"/>
<text x="116" y="215" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#8b97a8">fw:express</text>
<text x="20" y="450" font-family="sans-serif" font-size="13" fill="#e6edf3">Top 12 scored against your stack.</text>
</svg>`;

writeFileSync("docs/screenshot-recommended.svg", R);
console.log("Wrote recommended.svg");

const S = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1117"/><stop offset="1" stop-color="#161b22"/></linearGradient>
<linearGradient id="g3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4d8bf2"/><stop offset="1" stop-color="#a371f7"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#bg)"/>
<rect x="0" y="0" width="1600" height="80" fill="#131820"/>
<text x="40" y="48" font-family="sans-serif" font-size="22" fill="#e6edf3" font-weight="700">\u2318 Cline Marketplace</text>
<rect x="0" y="80" width="1600" height="44" fill="#0d1218"/>
<text x="40" y="108" font-family="sans-serif" font-size="13" fill="#8b97a8">Catalog</text>
<text x="400" y="108" font-family="sans-serif" font-size="13" fill="#6aa9ff" font-weight="600">Stats</text>
<line x1="396" y1="124" x2="460" y2="124" stroke="#6aa9ff" stroke-width="2"/>
<rect x="40" y="160" width="380" height="320" rx="10" fill="#1c2128" stroke="#2a313c"/>
<text x="60" y="200" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">BY TYPE</text>
<text x="60" y="240" font-family="sans-serif" font-size="12" fill="#8b97a8">Plugins</text>
<rect x="140" y="230" width="180" height="14" rx="2" fill="#161b22"/>
<rect x="140" y="230" width="22" height="14" rx="2" fill="url(#g3)"/>
<text x="330" y="240" font-family="sans-serif" font-size="12" fill="#e6edf3">15</text>
<text x="60" y="270" font-family="sans-serif" font-size="12" fill="#8b97a8">Skills</text>
<rect x="140" y="260" width="180" height="14" rx="2" fill="#161b22"/>
<rect x="140" y="260" width="56" height="14" rx="2" fill="url(#g3)"/>
<text x="330" y="270" font-family="sans-serif" font-size="12" fill="#e6edf3">38</text>
<text x="60" y="300" font-family="sans-serif" font-size="12" fill="#8b97a8">MCPs</text>
<rect x="140" y="290" width="180" height="14" rx="2" fill="#161b22"/>
<rect x="140" y="290" width="180" height="14" rx="2" fill="url(#g3)"/>
<text x="330" y="300" font-family="sans-serif" font-size="12" fill="#e6edf3">149</text>
<rect x="440" y="160" width="380" height="320" rx="10" fill="#1c2128" stroke="#2a313c"/>
<text x="460" y="200" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">TOP AUTHORS</text>
<g font-family="sans-serif" font-size="13" fill="#e6edf3">
<text x="460" y="240">1.  Cline</text><text x="780" y="240" text-anchor="end" fill="#8b97a8">25</text>
<text x="460" y="270">2.  Google Cloud</text><text x="780" y="270" text-anchor="end" fill="#8b97a8">13</text>
<text x="460" y="300">3.  AWS</text><text x="780" y="300" text-anchor="end" fill="#8b97a8">10</text>
</g>
<rect x="840" y="160" width="380" height="320" rx="10" fill="#1c2128" stroke="#2a313c"/>
<text x="860" y="200" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">TAGS</text>
<g font-family="sans-serif" font-size="12">
<text x="860" y="240" fill="#8b97a8">software</text>
<rect x="960" y="230" width="160" height="14" rx="2" fill="#161b22"/>
<rect x="960" y="230" width="160" height="14" rx="2" fill="url(#g3)"/>
<text x="1130" y="240" fill="#e6edf3">108</text>
<text x="860" y="270" fill="#8b97a8">data</text>
<rect x="960" y="260" width="160" height="14" rx="2" fill="#161b22"/>
<rect x="960" y="260" width="100" height="14" rx="2" fill="url(#g3)"/>
<text x="1130" y="270" fill="#e6edf3">66</text>
</g>
<rect x="1240" y="160" width="320" height="320" rx="10" fill="#1c2128" stroke="#2a313c"/>
<text x="1260" y="200" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">HEALTH</text>
<g font-family="sans-serif" font-size="13">
<text x="1260" y="240" fill="#3fb950">\u2713</text><text x="1280" y="240" fill="#e6edf3">node</text>
<text x="1260" y="270" fill="#f85149">\u2717</text><text x="1280" y="270" fill="#e6edf3">cline CLI</text>
<text x="1260" y="300" fill="#3fb950">\u2713</text><text x="1280" y="300" fill="#e6edf3">gh</text>
</g>
</svg>`;

writeFileSync("docs/screenshot-stats.svg", S);
console.log("Wrote stats.svg");

const D = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
<rect width="1600" height="900" fill="rgba(0,0,0,0.55)"/>
<rect x="280" y="60" width="1040" height="780" rx="10" fill="#1c2128" stroke="#3a4250"/>
<rect x="1240" y="80" width="60" height="36" rx="18" fill="#161b22"/>
<text x="1270" y="104" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#8b97a8">\u00d7</text>
<text x="320" y="140" font-family="sans-serif" font-size="28" fill="#e6edf3" font-weight="700">Context7</text>
<text x="320" y="170" font-family="sans-serif" font-size="14" fill="#8b97a8">Up-to-date code docs for any library, fetched on demand</text>
<rect x="320" y="190" width="64" height="20" rx="3" fill="rgba(63,185,80,0.15)" stroke="#3fb950"/>
<text x="352" y="205" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#3fb950" font-weight="700">VERIFIED</text>
<rect x="392" y="190" width="56" height="20" rx="3" fill="rgba(106,169,255,0.15)" stroke="#6aa9ff"/>
<text x="420" y="205" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#6aa9ff" font-weight="700">NEW</text>
<text x="320" y="240" font-family="sans-serif" font-size="13" fill="#e6edf3">A remote MCP server that pulls version-accurate documentation</text>
<text x="320" y="260" font-family="sans-serif" font-size="13" fill="#e6edf3">for thousands of libraries directly into the model's context.</text>
<text x="320" y="310" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">INSTALL COMMAND</text>
<rect x="320" y="322" width="960" height="56" rx="6" fill="#0a0d12" stroke="#2a313c"/>
<text x="336" y="358" font-family="ui-monospace, monospace" font-size="13" fill="#6aa9ff">cline mcp install context7 --transport http https://mcp.context7.com/mcp</text>
<rect x="320" y="400" width="140" height="36" rx="6" fill="#161b22" stroke="#3a4250"/>
<text x="390" y="422" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#e6edf3">Copy command</text>
<rect x="472" y="400" width="100" height="36" rx="6" fill="#4d8bf2" stroke="#4d8bf2"/>
<text x="522" y="422" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#fff" font-weight="700">Install</text>
<rect x="584" y="400" width="100" height="36" rx="6" fill="transparent" stroke="#f85149"/>
<text x="634" y="422" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#f85149">Uninstall</text>
<rect x="696" y="400" width="170" height="36" rx="6" fill="#161b22" stroke="#3a4250"/>
<text x="781" y="422" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#e6edf3">\u2606 Add to watchlist</text>
<text x="320" y="480" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">ENVIRONMENT VARIABLES</text>
<rect x="320" y="496" width="960" height="80" rx="6" fill="#0a0d12" stroke="#2a313c"/>
<text x="336" y="520" font-family="ui-monospace, monospace" font-size="12" fill="#6aa9ff">CONTEXT7_API_KEY</text>
<text x="540" y="520" font-family="sans-serif" font-size="12" fill="#e6edf3">optional</text>
<text x="640" y="520" font-family="sans-serif" font-size="12" fill="#e6edf3">Higher rate limits on the Context7 dashboard</text>
<line x1="320" y1="536" x2="1280" y2="536" stroke="#2a313c"/>
<text x="320" y="610" font-family="sans-serif" font-size="11" fill="#5d6877" font-weight="700">DETAILS</text>
<g font-family="sans-serif" font-size="13" fill="#e6edf3" transform="translate(320,630)">
<text>Repo:  https://github.com/upstash/context7</text>
<text y="24">License:  MIT</text>
<text y="48">Last upstream commit:  3 days ago</text>
<text y="72">Commit:  a84b554  add tool version detection</text>
</g>
</svg>`;

writeFileSync("docs/screenshot-detail.svg", D);
console.log("Wrote detail.svg");