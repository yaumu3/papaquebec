# Writing a map set converter

The schema says what a map set may hold; these are the rules it cannot say.

- Coordinates are `[lon, lat]`, exactly two numbers.
- One Feature per volume.
  - An area filed in parts, stepped in its limits or split by altitude is several Features.
- An item is a layer and a name: Features sharing both are one item on the Maps panel.
  - A route that leaves and re-enters the set is several Features under one name.
- A stratum suffix the source puts in a name belongs in `lower` and `upper`, not in the name.
  - `Z55(375-)` is `Z55` with `lower` `FL375`.
- An area is included whole or not at all.
- A boundary two areas share is written identically on both.
  - Vertices within 1e-5° of each other are merged and the edge is drawn once.
- Navaid kinds are spelled exactly `VOR`, `DME`, `VOR/DME`, `TACAN`, `VORTAC` or `NDB`.
- `effective` is the AIRAC effective date, `YYYY-MM-DD`.
- Point ids are unique among `ad`, `navaid` and `fix`; a `vfr` id may repeat.

See [`example.mapset.geojson`](example.mapset.geojson), which uses every layer, and
[`mapset.schema.json`](mapset.schema.json).
