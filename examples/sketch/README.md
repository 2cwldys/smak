# Sketches

`village.svg` is a drawing as Inkscape saves it: open it in Inkscape to see how the labels and layers are
written (Object → Object Properties; Layer → Layers and Objects). `paint.png` is a drawing in flat colours with
`paint-legend.json`, its legend. Both make a map:

```
node bin/smak.mjs sketch examples/sketch/village.svg -o village.map --wad <halflife.wad> --plan village.png
node bin/smak.mjs sketch examples/sketch/paint.png -o paint.map --legend examples/sketch/paint-legend.json --wad <halflife.wad>
```

The textures are Half-Life's (`valve/halflife.wad`). `docs/MAPS-SKETCH.md` says the rest.

`pieces.svg` has every piece a drawing can ask for: a cave of rough rock, a ramp, a yard open to the sky with a
chasm and a bridge over it, and a spiral stair in a tower up to a loft.
