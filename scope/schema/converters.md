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
  - Vertices that round to the same 1e-5° grid point (integer `round(deg × 1e5)`) are one vertex, and an edge with the same two vertices is drawn once.
- Boundaries that trace the same line are written with identical vertices.
  - A source may trace one line twice with different vertex spacing: in JCAB's data, about 330 NM between civil and military approach control areas and 150 NM between the FIR and the sectors.
  - Node the area layers against each other before writing (shapely `snap`/`node`, mapshaper `-snap`), so the shared stretch has the same vertices on both sides.
- A route may be written as just its fixes: the scope draws the geodesic between consecutive vertices.
  - A converter whose source densifies segments may drop the intermediate vertices when they lie on that geodesic, which keeps sets small.
  - A route stops short of a point only where one of its vertices coincides with it, so a route's fixes must be among its vertices.
- Navaid kinds are spelled exactly `VOR`, `DME`, `VOR/DME`, `TACAN`, `VORTAC` or `NDB`.
- `effective` is the AIRAC effective date, `YYYY-MM-DD`.
- Point ids are unique among `ad`, `navaid` and `fix`; a `vfr` id may repeat.

See [`example.mapset.geojson`](example.mapset.geojson), which uses every layer, and
[`mapset.schema.json`](mapset.schema.json).
