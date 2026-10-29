# TransitIQ — Bengaluru Metro Route Intelligence

A browser-only journey planner for Namma Metro's Purple and Green corridors. Search a station-to-station route across a real station-order dataset, price it with distance-based fare slabs, and watch it draw on a schematic map. No uploads, telemetry, external assets, or build step.

**TransitIQ — a Skill Lab project.**

![Journey planner](assets/screenshots/01-home.png)

## What it does

- Loads a static dataset of 69 stations across two corridors with one shared interchange node at Majestic.
- Runs Dijkstra's algorithm over a locally built graph to find the fastest path, weighting each ride at `km × 2.5` minutes and charging a 4-minute transfer at the interchange.
- Adds platform wait per leg (2 min off-peak, 5 min peak) and a peak-hours toggle that re-times the estimate.
- Prices the trip with six fare slabs (₹10–₹60) matched to the summed segment distance.
- Autocompletes station names in an ARIA `combobox` on both the origin and destination fields, with keyboard navigation and a clear button.
- Provides three real sample journeys, inline error messages, and a clear distinction between no selection and no possible route.
- Draws an interactive SVG schematic map: hover or focus a station for its name, click to set the origin then the destination, and see the chosen route highlighted. A `details`/`summary` station list is available as a text alternative.
- Remembers up to five recent trips in `localStorage` (key `transitiq.recent.v1`) with a graceful fallback if storage is unavailable, and a "Clear all" button that empties the list.
- Ships a second page (`network.html`) with the full station register: both corridors in corridor order, per-station segment distances, and computed summary chips.

![Cross-line route](assets/screenshots/02-crossline.png)

## Tech stack

- HTML5, CSS, and vanilla JavaScript
- Bootstrap 5.3.3 for the grid and base components
- jQuery 3.7.1 for DOM events and rendering
- Local vendored copies only; no CDN or network requests

## Project structure

```text
transitiq/
├─ index.html          # Planner, schematic map, method and fare tables
├─ network.html        # Full station register for both corridors
├─ css/
│  └─ style.css
├─ js/
│  ├─ data.js          # Station dataset, fare slabs, model constants
│  └─ app.js           # Graph, Dijkstra, map, combobox, results, storage
├─ vendor/
│  ├─ bootstrap.min.css
│  ├─ bootstrap.bundle.min.js
│  └─ jquery-3.7.1.min.js
├─ assets/screenshots/
│  ├─ 01-home.png
│  ├─ 02-crossline.png
│  ├─ 03-network.png
│  └─ 04-mobile.png
└─ README.md
```

## Run locally

From the `transitiq` folder:

```powershell
python -m http.server 8125
```

Open <http://localhost:8125/>. A local server is recommended; opening `index.html` directly still works in most browsers.

## The model

| Parameter | Value |
| --- | --- |
| Ride time | `km × 2.5` min, rounded to the nearest minute |
| Transfer (line change at Majestic) | +4 min |
| Platform wait per leg, off-peak | 2 min |
| Platform wait per leg, peak | 5 min |
| Fare | Sum of segment distances → slab |

### Fare slabs

| Distance | Fare |
| --- | ---: |
| 0 – 2 km | ₹10 |
| 2 – 4 km | ₹20 |
| 4 – 8 km | ₹30 |
| 8 – 12 km | ₹40 |
| 12 – 18 km | ₹50 |
| Over 18 km | ₹60 |

## How the search works

1. **Build the graph.** Every station is a node. Consecutive stations on a line are joined by an edge weighted at ride time; the shared Majestic node participates in both corridors without being duplicated.
2. **Search.** Dijkstra explores from the origin using a binary min-heap and settles each station at its lowest known time. The search also tracks which line each arrival uses, so a line switch pays the transfer penalty exactly once.
3. **Add waiting, then price.** Each boarding leg adds the applicable platform wait. Distance is summed along the path and matched to a slab.

## Sample journeys

| Route | Lines |
| --- | --- |
| Whitefield → Challaghatta | Purple, end to end |
| Whitefield → Silk Institute | Purple + Green, one change |
| Madavara → Silk Institute | Green, end to end |

## The dataset

Station order follows the public Namma Metro corridor sequence: Purple from Whitefield (Kadugodi) to Challaghatta, Green from Madavara to Silk Institute. `kmToNext` values are realistic approximations (roughly 1.0–1.6 km) written for this project, not official BMRCL figures, and the exact station-registry total is recomputed live on the network page.

## Accessibility of the tool itself

- Semantic header, main content, complementary panels, and footer; skip link with visible focus rings.
- ARIA `combobox`/`listbox` pattern for both station fields with `aria-expanded` and `aria-controls`.
- The SVG map is keyboard reachable; stations expose names on focus, and a text fallback list sits outside the map.
- Live regions announce results and errors (`role="alert"` for planner errors); `aria-live` results panel.
- The station tables use `caption`, `scope="col"` headers, and reflow on narrow widths.
- Reduced-motion support and no dependence on hover.

![Station register](assets/screenshots/03-network.png)

## Testing performed

- `node --check` on `js/app.js` and `js/data.js`.
- Both pages served locally and loaded in a real browser: no console errors, no failed or external requests.
- Network page statistics (`stations`, `lines`, `interchanges`, `network-km`) populated from the dataset, not hardcoded.
- UTF-8 hygiene: the planner page and station register render em dashes, middots, rupee signs, and arrows correctly; a byte-level encoding check was run on the network page after repair.

![Mobile layout](assets/screenshots/04-mobile.png)

## Limitations

- Static teaching model. It does not know live train positions, disruptions, walking time inside stations, accessibility requirements, or real BMRCL timetables and fares.
- Segment distances and ride times are estimates; the schematic map is not to scale.
- Recent trips live in one browser's `localStorage`; there is no sync, accounts, or server.
- No production support; this is a Skill Lab exercise.

## Credits

TransitIQ — a Skill Lab project.  
Built with HTML, CSS, Bootstrap 5.3.3, and jQuery 3.7.1. All libraries are local.
