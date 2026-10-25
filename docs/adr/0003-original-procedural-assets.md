# Original procedural assets, no runtime network

Every runtime asset — character meshes, patterns, hats, level geometry, textures, particles, music, and SFX — is generated in code, with one open-license bundled font. This keeps the project license-clean, avoids copying Fall Guys' protected art, eliminates runtime CDN and asset-path failures on GitHub Pages, and makes the build fully self-contained. The cost is that visual fidelity is bounded by what the code can generate, and art changes are code changes.

**Consequences:** no external model, texture, or audio pipeline; loading is fast and offline-capable; the project must invest in procedural composition (silhouette, palette, lighting, prop grammar) rather than asset variety.
