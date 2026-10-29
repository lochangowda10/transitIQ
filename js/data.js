/*
 * TransitIQ — js/data.js
 * ------------------------------------------------------------------
 * Static dataset for the Namma Metro Purple and Green corridors.
 *
 * Each station entry carries:
 *   id         unique slug used in URLs and the DOM
 *   name       full official display name
 *   shortName  compact label used on the schematic map
 *   kmToNext   approximate distance to the following station on that line
 *   interchange  true only for the shared Majestic node
 *
 * `kmToNext` values are realistic approximations (roughly 1.0–1.6 km).
 * They are estimates for a student project, not official BMRCL figures.
 * Majestic is listed in both line sequences so that each line keeps its
 * own order and distances, but the registry below merges it into ONE
 * shared graph node (the pair is deliberately not duplicated).
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* Purple Line: Whitefield (Kadugodi) -> Challaghatta (east to west) */
  var PURPLE_STATIONS = [
    { id: 'whitefield', name: 'Whitefield (Kadugodi)', shortName: 'Whitefield', kmToNext: 1.3 },
    { id: 'hopefarm-channasandra', name: 'Hopefarm Channasandra', shortName: 'Hope Farm', kmToNext: 1.2 },
    { id: 'kadugodi-tree-park', name: 'Kadugodi Tree Park', shortName: 'Kadugodi', kmToNext: 1.5 },
    { id: 'pattandur-agrahara', name: 'Pattandur Agrahara', shortName: 'Pattandur', kmToNext: 1.3 },
    { id: 'sri-sathya-sai-hospital', name: 'Sri Sathya Sai Hospital', shortName: 'Sathya Sai', kmToNext: 1.2 },
    { id: 'nallurhalli', name: 'Nallurhalli', shortName: 'Nallurhalli', kmToNext: 1.6 },
    { id: 'kundalahalli', name: 'Kundalahalli', shortName: 'Kundalahalli', kmToNext: 1.2 },
    { id: 'seetharam-palya', name: 'Seetharam Palya', shortName: 'Seetharam Palya', kmToNext: 1.1 },
    { id: 'hoodi', name: 'Hoodi', shortName: 'Hoodi', kmToNext: 1.3 },
    { id: 'garudacharpalya', name: 'Garudacharpalya', shortName: 'Garudacharpalya', kmToNext: 1.4 },
    { id: 'mahadevapura', name: 'Mahadevapura', shortName: 'Mahadevapura', kmToNext: 1.2 },
    { id: 'singayyanapalya', name: 'Singayyanapalya', shortName: 'Singayyanapalya', kmToNext: 1.5 },
    { id: 'krishnarajapura', name: 'Krishnarajapura', shortName: 'K R Pura', kmToNext: 1.6 },
    { id: 'benniganahalli', name: 'Benniganahalli', shortName: 'Benniganahalli', kmToNext: 1.4 },
    { id: 'baiyappanahalli', name: 'Baiyappanahalli', shortName: 'Baiyappanahalli', kmToNext: 1.3 },
    { id: 'swami-vivekananda-road', name: 'Swami Vivekananda Road', shortName: 'Vivekananda Rd', kmToNext: 1.2 },
    { id: 'indiranagar', name: 'Indiranagar', shortName: 'Indiranagar', kmToNext: 1.3 },
    { id: 'halasuru', name: 'Halasuru', shortName: 'Halasuru', kmToNext: 1.2 },
    { id: 'trinity', name: 'Trinity', shortName: 'Trinity', kmToNext: 1.1 },
    { id: 'mg-road', name: 'MG Road', shortName: 'MG Road', kmToNext: 1.0 },
    { id: 'cubbon-park', name: 'Cubbon Park', shortName: 'Cubbon Park', kmToNext: 1.1 },
    { id: 'vidhana-soudha', name: 'Vidhana Soudha', shortName: 'Vidhana Soudha', kmToNext: 1.0 },
    { id: 'sir-m-visvesvaraya', name: 'Sir M Visvesvaraya', shortName: 'Visvesvaraya', kmToNext: 1.3 },
    { id: 'majestic', name: 'Majestic (Nadaprabhu Kempegowda)', shortName: 'Majestic', kmToNext: 1.2, interchange: true },
    { id: 'city-railway-station', name: 'City Railway Station', shortName: 'City Station', kmToNext: 1.3 },
    { id: 'magadi-road', name: 'Magadi Road', shortName: 'Magadi Road', kmToNext: 1.2 },
    { id: 'hosahalli', name: 'Hosahalli', shortName: 'Hosahalli', kmToNext: 1.1 },
    { id: 'vijayanagar', name: 'Vijayanagar', shortName: 'Vijayanagar', kmToNext: 1.2 },
    { id: 'attiguppe', name: 'Attiguppe', shortName: 'Attiguppe', kmToNext: 1.1 },
    { id: 'deepanjali-nagar', name: 'Deepanjali Nagar', shortName: 'Deepanjali Nagar', kmToNext: 1.2 },
    { id: 'mysuru-road', name: 'Mysuru Road', shortName: 'Mysuru Road', kmToNext: 1.3 },
    { id: 'nayandahalli', name: 'Nayandahalli', shortName: 'Nayandahalli', kmToNext: 1.4 },
    { id: 'rajarajeshwari-nagar', name: 'Rajarajeshwari Nagar', shortName: 'RR Nagar', kmToNext: 1.3 },
    { id: 'jnanabharathi', name: 'Jnanabharathi', shortName: 'Jnanabharathi', kmToNext: 1.4 },
    { id: 'pattanagere', name: 'Pattanagere', shortName: 'Pattanagere', kmToNext: 1.5 },
    { id: 'kengeri-bus-terminal', name: 'Kengeri Bus Terminal', shortName: 'Kengeri Bus Stn', kmToNext: 1.2 },
    { id: 'kengeri', name: 'Kengeri', shortName: 'Kengeri', kmToNext: 1.3 },
    { id: 'challaghatta', name: 'Challaghatta', shortName: 'Challaghatta', kmToNext: 0 }
  ];

  /* Green Line: Madavara -> Silk Institute (north to south) */
  var GREEN_STATIONS = [
    { id: 'madavara', name: 'Madavara', shortName: 'Madavara', kmToNext: 1.4 },
    { id: 'chikkabidarakallu', name: 'Chikkabidarakallu', shortName: 'Chikkabidarakallu', kmToNext: 1.2 },
    { id: 'manjunathanagara', name: 'Manjunathanagara', shortName: 'Manjunathanagara', kmToNext: 1.3 },
    { id: 'nagasandra', name: 'Nagasandra', shortName: 'Nagasandra', kmToNext: 1.4 },
    { id: 'dasarahalli', name: 'Dasarahalli', shortName: 'Dasarahalli', kmToNext: 1.3 },
    { id: 'jalahalli', name: 'Jalahalli', shortName: 'Jalahalli', kmToNext: 1.2 },
    { id: 'peenya-industry', name: 'Peenya Industry', shortName: 'Peenya Industry', kmToNext: 1.1 },
    { id: 'peenya', name: 'Peenya', shortName: 'Peenya', kmToNext: 1.4 },
    { id: 'goraguntepalya', name: 'Goraguntepalya', shortName: 'Goraguntepalya', kmToNext: 1.6 },
    { id: 'yeshwanthpur', name: 'Yeshwanthpur', shortName: 'Yeshwanthpur', kmToNext: 1.3 },
    { id: 'sandal-soap-factory', name: 'Sandal Soap Factory', shortName: 'Sandal Soap', kmToNext: 1.2 },
    { id: 'mahalakshmi', name: 'Mahalakshmi', shortName: 'Mahalakshmi', kmToNext: 1.1 },
    { id: 'rajajinagar', name: 'Rajajinagar', shortName: 'Rajajinagar', kmToNext: 1.2 },
    { id: 'kuvempu-road', name: 'Kuvempu Road', shortName: 'Kuvempu Road', kmToNext: 1.1 },
    { id: 'srirampura', name: 'Srirampura', shortName: 'Srirampura', kmToNext: 1.3 },
    { id: 'mantri-square-sampige-road', name: 'Mantri Square Sampige Road', shortName: 'Mantri Square', kmToNext: 1.4 },
    { id: 'majestic', name: 'Majestic (Nadaprabhu Kempegowda)', shortName: 'Majestic', kmToNext: 1.1, interchange: true },
    { id: 'chickpet', name: 'Chickpet', shortName: 'Chickpet', kmToNext: 1.0 },
    { id: 'krishna-rajendra-market', name: 'Krishna Rajendra Market', shortName: 'K R Market', kmToNext: 1.2 },
    { id: 'national-college', name: 'National College', shortName: 'National College', kmToNext: 1.1 },
    { id: 'lalbagh', name: 'Lalbagh', shortName: 'Lalbagh', kmToNext: 1.2 },
    { id: 'south-end-circle', name: 'South End Circle', shortName: 'South End Circle', kmToNext: 1.1 },
    { id: 'jayanagar', name: 'Jayanagar', shortName: 'Jayanagar', kmToNext: 1.2 },
    { id: 'rashtreeya-vidyalaya-road', name: 'Rashtreeya Vidyalaya Road', shortName: 'RV Road', kmToNext: 1.3 },
    { id: 'banashankari', name: 'Banashankari', shortName: 'Banashankari', kmToNext: 1.1 },
    { id: 'jayaprakash-nagar', name: 'Jayaprakash Nagar', shortName: 'JP Nagar', kmToNext: 1.3 },
    { id: 'yelachenahalli', name: 'Yelachenahalli', shortName: 'Yelachenahalli', kmToNext: 1.5 },
    { id: 'konanakunte-cross', name: 'Konanakunte Cross', shortName: 'Konanakunte', kmToNext: 1.4 },
    { id: 'doddakallasandra', name: 'Doddakallasandra', shortName: 'Doddakallasandra', kmToNext: 1.3 },
    { id: 'vajarahalli', name: 'Vajarahalli', shortName: 'Vajarahalli', kmToNext: 1.4 },
    { id: 'talaghattapura', name: 'Talaghattapura', shortName: 'Talaghattapura', kmToNext: 1.5 },
    { id: 'silk-institute', name: 'Silk Institute', shortName: 'Silk Institute', kmToNext: 0 }
  ];

  /**
   * Turn a raw line sequence into a line object with ordered records.
   * Order is 1-based and totalKm excludes the terminus zero value.
   */
  function buildLine(id, name, color, raw) {
    var totalKm = 0;
    var stations = raw.map(function (entry, index) {
      var kmToNext = entry.kmToNext || 0;
      totalKm += kmToNext;
      return {
        id: entry.id,
        name: entry.name,
        shortName: entry.shortName,
        line: id,
        order: index + 1,
        kmToNext: kmToNext,
        interchange: entry.interchange === true
      };
    });
    return { id: id, name: name, color: color, stations: stations, totalKm: totalKm };
  }

  var purple = buildLine('purple', 'Purple Line', '#6A2C91', PURPLE_STATIONS);
  var green = buildLine('green', 'Green Line', '#007A53', GREEN_STATIONS);
  var lines = [purple, green];

  /*
   * Build a single station registry. Majestic is present in both line
   * sequences, so it is merged here and marked as the sole interchange.
   */
  var registry = {};
  lines.forEach(function (line) {
    line.stations.forEach(function (station) {
      var existing = registry[station.id];
      if (!existing) {
        registry[station.id] = {
          id: station.id,
          name: station.name,
          shortName: station.shortName,
          line: station.interchange ? 'interchange' : station.line,
          lines: [station.line],
          interchange: station.interchange
        };
      } else {
        existing.lines.push(station.line);
        existing.line = 'interchange';
        existing.interchange = true;
      }
    });
  });

  /* Fare slabs are distance based; the final slab is open ended. */
  var fareSlabs = [
    { label: '0 – 2 km', min: 0, max: 2, fare: 10 },
    { label: '2 – 4 km', min: 2, max: 4, fare: 20 },
    { label: '4 – 8 km', min: 4, max: 8, fare: 30 },
    { label: '8 – 12 km', min: 8, max: 12, fare: 40 },
    { label: '12 – 18 km', min: 12, max: 18, fare: 50 },
    { label: 'Over 18 km', min: 18, max: Infinity, fare: 60 }
  ];

  window.TRANSIT_DATA = {
    lines: lines,
    lineById: { purple: purple, green: green },
    stations: registry,
    fareSlabs: fareSlabs,
    transferPenaltyMin: 4,
    offPeakWaitMin: 2,
    peakWaitMin: 5,
    minutesPerKm: 2.5,
    interchangeId: 'majestic'
  };
})();
