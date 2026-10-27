# Conocto BIM

IFC-Modelle im Browser ansehen – mit Fokus auf Infrastruktur (IFC 4.3: Brücke, Straße, Bahn).

- Mehrere Modelle gleichzeitig laden
- Bauteilbaum: Modell → Bauwerk → Teil → IFC-Klasse → Bauteil
- Bauteil anklicken: Typ, Material, Mengen (Quantity-Sets) und Property-Sets
- Isolieren, Ausblenden, Alles zeigen
- Messen: Punkt (Koordinate, bei Georeferenz in Landeskoordinaten), Strecke, Fläche eines
  Bauteils, Volumen eines Bauteils
- Achsenkreuz unten links; Tipp auf Z = Draufsicht

**Die Modelle verlassen den Rechner nicht.** Alles läuft im Browser, es gibt keinen Server
und keinen Upload.

Teil von [Conocto](https://github.com/NicPalapte/bubbleLV).

## Lokal starten

```
npm install
npm run dev
```

## Technik

- [That Open Engine](https://github.com/ThatOpen): `web-ifc` (IFC lesen, WebAssembly),
  Fragments (kompakte Geometrie), Three.js (3D)
- Vite · React · TypeScript
- Look: Conocto-Designsystem (Tokens in `src/styles/conocto-tokens.css`)
