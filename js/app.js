/*
 * TransitIQ — js/app.js
 * ------------------------------------------------------------------
 * Vanilla JavaScript owns the data work: graph construction, Dijkstra,
 * fare slabs, URL parsing and storage. jQuery owns the DOM and events:
 * comboboxes, results rendering, SVG map interaction and micro-motion.
 *
 * Contents
 *   01. Setup and helpers
 *   02. Graph and shortest path
 *   03. Schematic map
 *   04. Accessible combobox
 *   05. Planner page
 *   06. Results and recent trips
 *   07. Network page
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var DATA = window.TRANSIT_DATA;
  if (!DATA) {
    return;
  }

  var STORAGE_KEY = 'transitiq.recent.v1';
  var RECENT_LIMIT = 5;
  var MAP_HINT_DEFAULT = 'Hover or focus a station for its name. Click a station to set the origin, then another to set the destination.';

  var stationList = Object.keys(DATA.stations)
    .map(function (id) { return DATA.stations[id]; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  /* ==================================================================
     01. Setup and helpers
     ================================================================== */

  /** Escape text that is interpolated into HTML strings. */
  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function lineName(lineId) {
    if (lineId === 'purple') { return 'Purple Line'; }
    if (lineId === 'green') { return 'Green Line'; }
    return 'Purple + Green';
  }

  function lineLabelFor(station) {
    if (station.line === 'interchange') { return 'Purple and Green lines'; }
    return lineName(station.line);
  }

  function lineColor(lineId) {
    return lineId === 'green' ? '#007A53' : '#6A2C91';
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollToResults() {
    var target = document.getElementById('results');
    if (!target) { return; }
    try {
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    } catch (error) {
      target.scrollIntoView();
    }
  }

  /* ==================================================================
     02. Graph and shortest path
     ================================================================== */

  function stateKey(stationId, lineId) {
    return stationId + '::' + lineId;
  }

  function parseStateKey(key) {
    var parts = key.split('::');
    return { id: parts[0], line: parts[1] };
  }

  /**
   * Build an adjacency list from the line sequences. States are
   * station + arrival line so that a change at Majestic can be charged
   * the 4-minute transfer penalty exactly once.
   */
  function buildNetwork() {
    var adjacency = {};

    function ensure(key) {
      if (!adjacency[key]) { adjacency[key] = []; }
      return adjacency[key];
    }

    function addEdge(from, to, minutes, lineId, km, transfer) {
      ensure(from).push({
        to: to,
        minutes: minutes,
        line: lineId,
        km: km,
        transfer: transfer === true
      });
      ensure(to);
    }

    DATA.lines.forEach(function (line) {
      line.stations.forEach(function (station, index) {
        var next = line.stations[index + 1];
        if (!next) {
          ensure(stateKey(station.id, line.id));
          return;
        }
        var minutes = Math.max(1, Math.round(station.kmToNext * DATA.minutesPerKm));
        addEdge(stateKey(station.id, line.id), stateKey(next.id, line.id), minutes, line.id, station.kmToNext, false);
        addEdge(stateKey(next.id, line.id), stateKey(station.id, line.id), minutes, line.id, station.kmToNext, false);
      });
    });

    var interchange = DATA.stations[DATA.interchangeId];
    if (interchange && interchange.lines.length > 1) {
      interchange.lines.forEach(function (lineA, indexA) {
        interchange.lines.slice(indexA + 1).forEach(function (lineB) {
          addEdge(stateKey(interchange.id, lineA), stateKey(interchange.id, lineB), DATA.transferPenaltyMin, 'transfer', 0, true);
          addEdge(stateKey(interchange.id, lineB), stateKey(interchange.id, lineA), DATA.transferPenaltyMin, 'transfer', 0, true);
        });
      });
    }

    return { adjacency: adjacency };
  }

  var NETWORK = buildNetwork();

  /** Small binary min-heap so Dijkstra does not scan every key. */
  function MinHeap() {
    this.items = [];
  }

  MinHeap.prototype.size = function () {
    return this.items.length;
  };

  MinHeap.prototype.push = function (key, cost) {
    var items = this.items;
    items.push({ key: key, cost: cost });
    var index = items.length - 1;
    while (index > 0) {
      var parent = (index - 1) >> 1;
      if (items[parent].cost <= items[index].cost) { break; }
      var swap = items[parent];
      items[parent] = items[index];
      items[index] = swap;
      index = parent;
    }
  };

  MinHeap.prototype.pop = function () {
    var items = this.items;
    if (!items.length) { return null; }
    var root = items[0];
    var last = items.pop();
    if (items.length) {
      items[0] = last;
      var index = 0;
      while (true) {
        var left = index * 2 + 1;
        var right = left + 1;
        var smallest = index;
        if (left < items.length && items[left].cost < items[smallest].cost) { smallest = left; }
        if (right < items.length && items[right].cost < items[smallest].cost) { smallest = right; }
        if (smallest === index) { break; }
        var swap = items[smallest];
        items[smallest] = items[index];
        items[index] = swap;
        index = smallest;
      }
    }
    return root;
  };

  /**
   * Dijkstra over station+line states.
   * Returns ride legs, transfer count, ride minutes, distance and the
   * ordered station path used by the map.
   */
  function shortestPath(originId, destinationId) {
    var origin = DATA.stations[originId];
    var destination = DATA.stations[destinationId];
    if (!origin || !destination) { return null; }
    if (originId === destinationId) { return null; }

    var sources = origin.lines.map(function (lineId) { return stateKey(originId, lineId); });
    var targets = {};
    destination.lines.forEach(function (lineId) { targets[stateKey(destinationId, lineId)] = true; });

    var distances = {};
    var previous = {};
    var visited = {};
    var heap = new MinHeap();
    var found = null;

    sources.forEach(function (key) {
      distances[key] = 0;
      heap.push(key, 0);
    });

    while (heap.size()) {
      var current = heap.pop();
      if (visited[current.key]) { continue; }
      visited[current.key] = true;

      if (targets[current.key]) {
        found = current.key;
        break;
      }

      var edges = NETWORK.adjacency[current.key] || [];
      for (var i = 0; i < edges.length; i += 1) {
        var edge = edges[i];
        var nextDistance = current.cost + edge.minutes;
        if (distances[edge.to] === undefined || nextDistance < distances[edge.to]) {
          distances[edge.to] = nextDistance;
          previous[edge.to] = { key: current.key, edge: edge };
          heap.push(edge.to, nextDistance);
        }
      }
    }

    if (!found) { return null; }

    var keys = [found];
    var edgesTaken = [];
    var cursor = found;
    while (previous[cursor]) {
      edgesTaken.unshift(previous[cursor].edge);
      keys.unshift(previous[cursor].key);
      cursor = previous[cursor].key;
    }

    var legs = [];
    var rideMinutes = 0;
    var distanceKm = 0;
    var stops = 0;
    var transferCount = 0;
    var index = 0;

    while (index < edgesTaken.length) {
      var edge = edgesTaken[index];
      if (edge.transfer) {
        transferCount += 1;
        index += 1;
        continue;
      }
      var leg = {
        line: edge.line,
        boardId: parseStateKey(keys[index]).id,
        alightId: parseStateKey(keys[index + 1]).id,
        stops: 0,
        minutes: 0,
        km: 0
      };
      while (index < edgesTaken.length && !edgesTaken[index].transfer && edgesTaken[index].line === leg.line) {
        leg.stops += 1;
        leg.minutes += edgesTaken[index].minutes;
        leg.km += edgesTaken[index].km;
        leg.alightId = parseStateKey(keys[index + 1]).id;
        rideMinutes += edgesTaken[index].minutes;
        distanceKm += edgesTaken[index].km;
        stops += 1;
        index += 1;
      }
      legs.push(leg);
    }

    var stationPath = [];
    keys.forEach(function (key) {
      var id = parseStateKey(key).id;
      if (stationPath[stationPath.length - 1] !== id) { stationPath.push(id); }
    });

    return {
      originId: originId,
      destinationId: destinationId,
      legs: legs,
      stops: stops,
      rideMin: rideMinutes,
      transferCount: transferCount,
      transferMin: transferCount * DATA.transferPenaltyMin,
      distanceKm: distanceKm,
      stationPath: stationPath
    };
  }

  function getFareSlab(km) {
    for (var i = 0; i < DATA.fareSlabs.length; i += 1) {
      if (km <= DATA.fareSlabs[i].max) { return DATA.fareSlabs[i]; }
    }
    return DATA.fareSlabs[DATA.fareSlabs.length - 1];
  }

  /* ==================================================================
     03. Schematic map
     ================================================================== */

  var mapController = null;

  function initMap() {
    var $svg = jQuery('#network-map');
    if (!$svg.length) { return; }

    var NS = 'http://www.w3.org/2000/svg';
    var PURPLE_Y = 400;
    var PURPLE_START = 70;
    var PURPLE_END = 1130;

    function svgEl(name, attrs) {
      var node = document.createElementNS(NS, name);
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          node.setAttribute(key, attrs[key]);
        });
      }
      return node;
    }

    var purple = DATA.lineById.purple;
    var green = DATA.lineById.green;
    var purpleStep = (PURPLE_END - PURPLE_START) / (purple.stations.length - 1);
    var positions = {};

    purple.stations.forEach(function (station, index) {
      positions[station.id] = { x: PURPLE_START + index * purpleStep, y: PURPLE_Y, line: 'purple' };
    });

    var interchangePosition = positions[DATA.interchangeId];
    var northStart = { x: 540, y: 72 };
    var southEnd = { x: 648, y: 728 };

    /** Place stations along a straight schematic segment by distance. */
    function distribute(stations, start, end) {
      var totalKm = stations.reduce(function (sum, station, index) {
        return index < stations.length - 1 ? sum + station.kmToNext : sum;
      }, 0);
      var cumulative = 0;
      var dx = end.x - start.x;
      var dy = end.y - start.y;
      stations.forEach(function (station, index) {
        var fraction = totalKm === 0 ? 0 : cumulative / totalKm;
        positions[station.id] = {
          x: start.x + dx * fraction,
          y: start.y + dy * fraction,
          line: 'green'
        };
        if (index < stations.length - 1) { cumulative += station.kmToNext; }
      });
    }

    distribute(green.stations.slice(0, 17), northStart, { x: interchangePosition.x, y: interchangePosition.y });
    positions[DATA.interchangeId] = { x: interchangePosition.x, y: interchangePosition.y, line: 'interchange' };
    distribute(green.stations.slice(16), { x: interchangePosition.x, y: interchangePosition.y }, southEnd);

    var purpleMajors = {
      'whitefield': 'above',
      'baiyappanahalli': 'below',
      'indiranagar': 'above',
      'mg-road': 'below',
      'majestic': 'above',
      'city-railway-station': 'below',
      'mysuru-road': 'above',
      'kengeri-bus-terminal': 'below',
      'challaghatta': 'above'
    };
    var greenMajors = {
      'madavara': true,
      'nagasandra': true,
      'yeshwanthpur': true,
      'lalbagh': true,
      'jayanagar': true,
      'banashankari': true,
      'silk-institute': true
    };
    var greenOrder = {};
    green.stations.forEach(function (station, index) { greenOrder[station.id] = index; });

    /* Document metadata and a real text description for assistive tech. */
    $svg.empty();
    var title = svgEl('title', { id: 'map-svg-title' });
    title.textContent = 'Schematic Namma Metro map';
    var desc = svgEl('desc', { id: 'map-svg-desc' });
    desc.textContent = 'Purple Line runs east to west from Whitefield to Challaghatta. Green Line runs north to south from Madavara to Silk Institute. The two lines meet at Majestic. A full station list follows the map.';
    $svg.append(title, desc);

    var baseLayer = svgEl('g', { 'aria-hidden': 'true' });
    var purplePath = 'M ' + PURPLE_START + ' ' + PURPLE_Y + ' H ' + PURPLE_END;
    var greenPath = 'M ' + northStart.x + ' ' + northStart.y +
      ' L ' + interchangePosition.x + ' ' + interchangePosition.y +
      ' L ' + southEnd.x + ' ' + southEnd.y;

    [
      { d: purplePath, colorClass: 'base-line--purple' },
      { d: greenPath, colorClass: 'base-line--green' }
    ].forEach(function (line) {
      baseLayer.appendChild(svgEl('path', { d: line.d, 'class': 'line-casing' }));
    });
    [
      { d: purplePath, colorClass: 'base-line--purple' },
      { d: greenPath, colorClass: 'base-line--green' }
    ].forEach(function (line) {
      baseLayer.appendChild(svgEl('path', { d: line.d, 'class': 'base-line ' + line.colorClass }));
    });
    $svg.append(baseLayer);

    var routeLayer = svgEl('g', { id: 'map-route-layer' });
    $svg.append(routeLayer);

    var stationLayer = svgEl('g', { id: 'map-stations' });
    var $tooltip = jQuery('#map-tooltip');
    var $canvas = jQuery('#map-canvas');

    function hideTooltip() {
      $tooltip.prop('hidden', true).empty();
    }

    function showTooltip(station, group) {
      var hint = station.interchange ? 'Interchange · click to select' : 'Click to select';
      $tooltip.html(
        '<span class="tt-meta">' + esc(lineLabelFor(station)) + '</span>' +
        '<strong>' + esc(station.name) + '</strong>' +
        '<span class="tt-meta">' + esc(hint) + '</span>'
      ).prop('hidden', false);

      var canvasRect = $canvas[0].getBoundingClientRect();
      var groupRect = group.getBoundingClientRect();
      var tooltipNode = $tooltip[0];
      var left = groupRect.left - canvasRect.left + $canvas[0].scrollLeft + (groupRect.width / 2) - (tooltipNode.offsetWidth / 2);
      var top = groupRect.top - canvasRect.top + $canvas[0].scrollTop - tooltipNode.offsetHeight - 10;
      var maxLeft = $canvas[0].clientWidth - tooltipNode.offsetWidth - 8;
      left = Math.max(8, Math.min(left, Math.max(8, maxLeft)));
      if (top < 8) {
        top = groupRect.top - canvasRect.top + $canvas[0].scrollTop + groupRect.height + 12;
      }
      $tooltip.css({ left: left + 'px', top: top + 'px' });
    }

    stationList.forEach(function (station) {
      var point = positions[station.id];
      if (!point) { return; }

      var isInterchange = station.line === 'interchange';
      var isPurple = station.line === 'purple';
      var isMajor = isPurple
        ? Object.prototype.hasOwnProperty.call(purpleMajors, station.id)
        : greenMajors[station.id] === true;
      var group = svgEl('g', {
        'class': 'map-station' + (isMajor ? ' is-major' : '') + (isInterchange ? ' is-interchange' : ''),
        'data-id': station.id,
        'data-line': station.line,
        tabindex: '0',
        role: 'button',
        'aria-label': station.name + ', ' + lineLabelFor(station) + '. Activate to set as origin or destination.'
      });

      group.appendChild(svgEl('circle', { cx: point.x, cy: point.y, r: 11, 'class': 'station-hit' }));
      group.appendChild(svgEl('circle', { cx: point.x, cy: point.y, r: isInterchange ? 7 : 4.5, 'class': 'station-dot' }));
      group.appendChild(svgEl('circle', { cx: point.x, cy: point.y, r: 2.2, 'class': 'station-core' }));

      var label = svgEl('text', { 'class': 'station-label' });
      if (isInterchange) {
        label.setAttribute('x', point.x);
        label.setAttribute('y', point.y - 15);
        label.setAttribute('text-anchor', 'middle');
      } else if (isPurple) {
        var side = purpleMajors[station.id];
        if (!side) {
          var purpleIndex = purple.stations.findIndex(function (entry) { return entry.id === station.id; });
          side = purpleIndex % 2 === 0 ? 'above' : 'below';
        }
        label.setAttribute('x', point.x);
        label.setAttribute('y', side === 'above' ? point.y - 15 : point.y + 24);
        label.setAttribute('text-anchor', 'middle');
      } else {
        var greenIndex = greenOrder[station.id];
        if (greenIndex < 16) {
          label.setAttribute('x', point.x - 12);
          label.setAttribute('y', point.y + 3.5);
          label.setAttribute('text-anchor', 'end');
        } else {
          label.setAttribute('x', point.x + 12);
          label.setAttribute('y', point.y + 3.5);
          label.setAttribute('text-anchor', 'start');
        }
      }
      label.textContent = station.shortName || station.name;
      group.appendChild(label);

      jQuery(group).on('click', function (event) {
        event.preventDefault();
        if (mapController && typeof mapController.onPick === 'function') {
          mapController.onPick(station.id);
        }
      });
      jQuery(group).on('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          if (mapController && typeof mapController.onPick === 'function') {
            mapController.onPick(station.id);
          }
        }
      });
      jQuery(group).on('mouseenter focus', function () { showTooltip(station, group); });
      jQuery(group).on('mouseleave blur', hideTooltip);

      stationLayer.appendChild(group);
    });

    $svg.append(stationLayer);

    $canvas.on('scroll', hideTooltip);
    jQuery('#map-reset').on('click', function () {
      if (mapController && typeof mapController.onReset === 'function') {
        mapController.onReset();
      }
    });

    function clearHighlights() {
      $svg.find('.map-station').removeClass('on-route is-endpoint is-origin is-destination is-visible');
      routeLayer.innerHTML = '';
      $svg.removeClass('has-route');
    }

    function markEndpoints(originId, destinationId) {
      clearHighlights();
      if (originId) {
        $svg.find('.map-station[data-id="' + originId + '"]').addClass('is-endpoint is-origin is-visible');
      }
      if (destinationId) {
        $svg.find('.map-station[data-id="' + destinationId + '"]').addClass('is-endpoint is-destination is-visible');
      }
    }

    function showSelection(originId, destinationId) {
      markEndpoints(originId, destinationId);
      hideTooltip();
    }

    function showRoute(originId, destinationId, stationPath) {
      markEndpoints(originId, destinationId);
      if (!stationPath || stationPath.length < 2) { return; }

      stationPath.forEach(function (id) {
        $svg.find('.map-station[data-id="' + id + '"]').addClass('on-route');
      });

      var d = '';
      stationPath.forEach(function (id, index) {
        var point = positions[id];
        if (!point) { return; }
        d += (index === 0 ? 'M ' : ' L ') + point.x + ' ' + point.y;
      });

      var path = svgEl('path', { d: d, 'class': 'route-line' });
      routeLayer.appendChild(path);
      $svg.addClass('has-route');

      var length = path.getTotalLength();
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      window.requestAnimationFrame(function () {
        path.classList.add('is-drawn');
      });
      hideTooltip();
    }

    mapController = {
      positions: positions,
      showSelection: showSelection,
      showRoute: showRoute,
      clear: function () {
        clearHighlights();
        hideTooltip();
      },
      onPick: null,
      onReset: null
    };

    /* Text alternative: the full station register, grouped by line. */
    var $fallback = jQuery('#station-fallback-grid');
    if ($fallback.length) {
      $fallback.html(DATA.lines.map(function (line) {
        var heading = '<h4><span class="line-dot line-dot--' + line.id + '" aria-hidden="true"></span>' + esc(line.name) + '</h4>';
        var items = line.stations.map(function (station) {
          return '<li' + (station.interchange ? ' class="is-interchange"' : '') + '>' +
            esc(station.name) + (station.interchange ? ' — interchange' : '') + '</li>';
        }).join('');
        return '<div>' + heading + '<ul>' + items + '</ul></div>';
      }).join(''));
    }
  }

  /* ==================================================================
     04. Accessible combobox
     ================================================================== */

  function Combobox(config) {
    this.id = config.id;
    this.$input = jQuery(config.input);
    this.$list = jQuery(config.list);
    this.$clear = jQuery(config.clear);
    this.$hint = jQuery(config.hint);
    this.hintDefault = config.hintDefault || this.$hint.text();
    this.onSelect = config.onSelect || function () {};
    this.value = null;
    this.items = [];
    this.activeIndex = -1;
    this.isOpen = false;
    this.bind();
  }

  Combobox.prototype.bind = function () {
    var self = this;

    this.$input.on('focus', function () {
      self.open(self.$input.val());
    });

    this.$input.on('input', function () {
      self.value = null;
      self.$clear.prop('hidden', self.$input.val() === '');
      self.open(self.$input.val());
      self.onSelect(null);
    });

    this.$input.on('keydown', function (event) {
      var key = event.key;
      if (key === 'ArrowDown') {
        event.preventDefault();
        if (!self.isOpen) { self.open(self.$input.val()); }
        self.move(1);
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        if (!self.isOpen) { self.open(self.$input.val()); }
        self.move(-1);
      } else if (key === 'Home' && self.isOpen) {
        event.preventDefault();
        self.setActive(0);
      } else if (key === 'End' && self.isOpen) {
        event.preventDefault();
        self.setActive(self.items.length - 1);
      } else if (key === 'Enter') {
        if (self.isOpen && self.activeIndex >= 0 && self.items[self.activeIndex]) {
          event.preventDefault();
          self.select(self.items[self.activeIndex]);
        }
      } else if (key === 'Escape') {
        if (self.isOpen) {
          event.preventDefault();
          self.close();
          self.restoreInput();
        }
      } else if (key === 'Tab') {
        self.close();
      }
    });

    this.$input.on('blur', function () {
      window.setTimeout(function () {
        self.close();
        self.resolveTyped();
      }, 150);
    });

    this.$clear.on('click', function () {
      self.clear();
      self.$input.trigger('focus');
      self.open('');
    });

    this.$list.on('mousedown', '.combo-option', function (event) {
      event.preventDefault();
      var id = jQuery(this).attr('data-id');
      var station = DATA.stations[id];
      if (station) { self.select(station); }
    });

    this.$list.on('mouseenter', '.combo-option', function () {
      self.setActive(jQuery(this).index());
    });
  };

  Combobox.prototype.open = function (query) {
    var q = String(query || '').trim().toLowerCase();
    var self = this;
    this.items = stationList.filter(function (station) {
      if (!q) { return true; }
      var haystack = (station.name + ' ' + station.shortName + ' ' + lineLabelFor(station)).toLowerCase();
      return haystack.indexOf(q) !== -1;
    });

    if (!this.items.length) {
      this.$list.html('<li class="combo-empty" role="presentation">No stations match that search.</li>');
    } else {
      this.$list.html(this.items.map(function (station) {
        return '<li class="combo-option" role="option" id="' + self.id + '-opt-' + station.id + '" data-id="' + station.id + '" aria-selected="false">' +
          '<span class="opt-name">' + esc(station.name) + '</span>' +
          '<span class="opt-line">' + esc(lineLabelFor(station)) + '</span>' +
          '</li>';
      }).join(''));
    }

    this.$list.prop('hidden', false);
    this.$input.attr('aria-expanded', 'true');
    this.isOpen = true;

    if (this.items.length) {
      this.setActive(this.activeIndex >= 0 ? Math.min(this.activeIndex, this.items.length - 1) : 0);
    } else {
      this.activeIndex = -1;
      this.$input.removeAttr('aria-activedescendant');
    }
  };

  Combobox.prototype.setActive = function (index) {
    var $options = this.$list.find('.combo-option');
    if (!$options.length) { return; }
    index = Math.max(0, Math.min(index, $options.length - 1));
    $options.removeClass('is-active').attr('aria-selected', 'false');
    var $active = $options.eq(index);
    $active.addClass('is-active').attr('aria-selected', 'true');
    this.activeIndex = index;
    this.$input.attr('aria-activedescendant', $active.attr('id'));

    var list = this.$list[0];
    var option = $active[0];
    if (option) {
      var top = option.offsetTop;
      var bottom = top + option.offsetHeight;
      if (top < list.scrollTop) {
        list.scrollTop = top;
      } else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    }
  };

  Combobox.prototype.move = function (delta) {
    if (!this.items.length) { return; }
    var next = this.activeIndex + delta;
    if (next < 0) { next = this.items.length - 1; }
    if (next >= this.items.length) { next = 0; }
    this.setActive(next);
  };

  Combobox.prototype.select = function (station) {
    if (!station) { return; }
    this.value = station.id;
    this.$input.val(station.name);
    this.$clear.prop('hidden', false);
    this.$hint.text(lineLabelFor(station) + ' selected.');
    this.close();
    this.onSelect(station);
  };

  Combobox.prototype.setStation = function (id, silent) {
    var station = DATA.stations[id];
    if (!station) {
      this.clear(silent);
      return;
    }
    this.value = station.id;
    this.$input.val(station.name);
    this.$clear.prop('hidden', false);
    this.$hint.text(lineLabelFor(station) + ' selected.');
    this.close();
    if (!silent) { this.onSelect(station); }
  };

  Combobox.prototype.clear = function (silent) {
    this.value = null;
    this.$input.val('');
    this.$clear.prop('hidden', true);
    this.$hint.text(this.hintDefault);
    this.close();
    if (!silent) { this.onSelect(null); }
  };

  Combobox.prototype.close = function () {
    this.$list.prop('hidden', true);
    this.$input.attr('aria-expanded', 'false').removeAttr('aria-activedescendant');
    this.isOpen = false;
    this.activeIndex = -1;
  };

  Combobox.prototype.restoreInput = function () {
    if (this.value && DATA.stations[this.value]) {
      this.$input.val(DATA.stations[this.value].name);
    } else {
      this.$input.val('');
      this.$clear.prop('hidden', true);
    }
  };

  Combobox.prototype.resolveTyped = function () {
    if (this.value) {
      this.restoreInput();
      return;
    }
    var typed = this.$input.val().trim();
    if (!typed) {
      this.$clear.prop('hidden', true);
      return;
    }
    var match = stationList.filter(function (station) {
      return station.name.toLowerCase() === typed.toLowerCase() ||
        station.shortName.toLowerCase() === typed.toLowerCase();
    })[0];
    if (match) {
      this.select(match);
    } else {
      this.$input.val('');
      this.$clear.prop('hidden', true);
      this.$hint.text(this.hintDefault);
    }
  };

  /* ==================================================================
     05. Planner page
     ================================================================== */

  function initPlannerPage() {
    var state = {
      originId: null,
      destinationId: null,
      peak: false,
      lastResult: null
    };

    var emptyHTML = jQuery('#results').html();
    var recentEntries = [];
    var recentBlocked = false;
    var originCombo = null;
    var destinationCombo = null;

    initMap();
    loadRecent();
    renderRecent();

    function updateMapHint(message) {
      jQuery('#map-hint').text(message || MAP_HINT_DEFAULT);
    }

    function clearError() {
      jQuery('#planner-error').text('');
      jQuery('#origin-input, #destination-input').removeAttr('aria-invalid');
    }

    function showError(message, focusField) {
      jQuery('#planner-error').text(message);
      if (focusField) {
        jQuery('#' + focusField + '-input').attr('aria-invalid', 'true').trigger('focus');
      }
    }

    function clearResultDisplay() {
      state.lastResult = null;
      jQuery('#results').html(emptyHTML);
      jQuery('#fare-rows tr').removeClass('is-active');
    }

    function updatePreview() {
      if (mapController) {
        mapController.showSelection(state.originId, state.destinationId);
      }
    }

    function updatePeakHint() {
      jQuery('#peak-hint').text(state.peak ? 'Adds 5 min wait per leg' : 'Adds 2 min wait per leg');
    }

    function updateFareActive(km) {
      var slab = getFareSlab(km);
      var index = DATA.fareSlabs.indexOf(slab);
      jQuery('#fare-rows tr').removeClass('is-active').eq(index).addClass('is-active');
    }

    function totalsFor(result) {
      var waitPerLeg = state.peak ? DATA.peakWaitMin : DATA.offPeakWaitMin;
      var waits = result.legs.length * waitPerLeg;
      return {
        waits: waits,
        total: result.rideMin + result.transferMin + waits,
        slab: getFareSlab(result.distanceKm),
        fare: getFareSlab(result.distanceKm).fare
      };
    }

    function writeHash(originId, destinationId) {
      var hash = '#route=' + originId + '|' + destinationId;
      try {
        window.history.replaceState(null, '', hash);
      } catch (error) {
        window.location.hash = hash;
      }
    }

    function readHash() {
      var match = window.location.hash.match(/^#route=([a-z0-9-]+)\|([a-z0-9-]+)$/);
      if (!match) { return null; }
      var originId = match[1];
      var destinationId = match[2];
      if (!DATA.stations[originId] || !DATA.stations[destinationId] || originId === destinationId) {
        return null;
      }
      return { origin: originId, destination: destinationId };
    }

    function clearHash() {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (error) {
        window.location.hash = '';
      }
    }

    /* -- Recent trips (localStorage, with graceful failure) ---------- */

    function loadRecent() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) { return; }
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) { return; }
        recentEntries = parsed.filter(function (entry) {
          return entry &&
            typeof entry.origin === 'string' &&
            typeof entry.destination === 'string' &&
            DATA.stations[entry.origin] &&
            DATA.stations[entry.destination];
        }).slice(0, RECENT_LIMIT);
      } catch (error) {
        recentBlocked = true;
        recentEntries = [];
      }
    }

    function persistRecent() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recentEntries));
        recentBlocked = false;
      } catch (error) {
        recentBlocked = true;
      }
    }

    function renderRecent() {
      var $list = jQuery('#recent-list');
      var $clear = jQuery('#recent-clear');

      if (!recentEntries.length) {
        $list.html('<p class="recent-empty">' + (recentBlocked
          ? 'Recent trips are unavailable because this browser blocked local storage.'
          : 'Planned journeys will appear here.') + '</p>');
        $clear.prop('hidden', true);
      } else {
        $list.html(recentEntries.map(function (entry) {
          var origin = DATA.stations[entry.origin];
          var destination = DATA.stations[entry.destination];
          return '<button class="recent-item" type="button" data-origin="' + entry.origin + '" data-destination="' + entry.destination + '" data-peak="' + (entry.peak ? '1' : '0') + '">' +
            '<strong>' + esc(origin.shortName) + ' → ' + esc(destination.shortName) + '</strong>' +
            '<span>' + entry.minutes + ' min · ₹' + entry.fare + ' · ' + (entry.peak ? 'Peak' : 'Off-peak') + ' · ' + Number(entry.distance).toFixed(1) + ' km</span>' +
            '</button>';
        }).join(''));
        $clear.prop('hidden', false);
      }

      jQuery('.recent-note').text(recentBlocked
        ? 'Local storage is blocked in this browser, so trips cannot be saved between visits.'
        : 'Stored only in this browser. Up to five trips. Nothing is sent anywhere.');
    }

    function addRecent(result, totalMinutes, fare) {
      var entry = {
        origin: result.originId,
        destination: result.destinationId,
        peak: state.peak,
        minutes: totalMinutes,
        fare: fare,
        distance: Number(result.distanceKm.toFixed(1)),
        at: Date.now()
      };
      recentEntries = recentEntries.filter(function (item) {
        return !(item.origin === entry.origin && item.destination === entry.destination && item.peak === entry.peak);
      });
      recentEntries.unshift(entry);
      recentEntries = recentEntries.slice(0, RECENT_LIMIT);
      persistRecent();
      renderRecent();
    }

    /* -- Results ---------------------------------------------------- */

    function renderResult(result) {
      var totals = totalsFor(result);
      var origin = DATA.stations[result.originId];
      var destination = DATA.stations[result.destinationId];
      var interchanges = result.legs.length - 1;
      var linesUsed = [];
      result.legs.forEach(function (leg) {
        var name = lineName(leg.line);
        if (linesUsed.indexOf(name) === -1) { linesUsed.push(name); }
      });

      var legsHTML = result.legs.map(function (leg, index) {
        var board = DATA.stations[leg.boardId];
        var alight = DATA.stations[leg.alightId];
        var legHTML = '<article class="leg" style="--leg-color: ' + lineColor(leg.line) + '">' +
          '<div class="leg-rail" aria-hidden="true"><span class="leg-marker"></span></div>' +
          '<div class="leg-body">' +
            '<div class="leg-top">' +
              '<span class="line-chip line-chip--' + leg.line + '">' + lineName(leg.line) + '</span>' +
              '<span class="leg-time">' + leg.minutes + ' min ride</span>' +
            '</div>' +
            '<p class="leg-stations"><strong>' + esc(board.name) + '</strong>' +
              '<span class="leg-arrow" aria-hidden="true">→</span>' +
              '<strong>' + esc(alight.name) + '</strong></p>' +
            '<p class="leg-sub">' + leg.stops + ' ' + (leg.stops === 1 ? 'stop' : 'stops') + ' · ' + leg.km.toFixed(1) + ' km</p>' +
          '</div>' +
        '</article>';

        if (index < result.legs.length - 1) {
          legHTML += '<div class="transfer-note">' +
            '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
              '<path d="M4 7h9M10 4l3 3-3 3M16 13H7M10 10l-3 3 3 3"></path>' +
            '</svg>' +
            '<div><strong>Change at Majestic</strong><br>' + DATA.transferPenaltyMin + ' min transfer buffer added to the estimate.</div>' +
          '</div>';
        }
        return legHTML;
      }).join('');

      var html = '<div class="result-ticket">' +
        '<div class="result-topbar" aria-hidden="true">' +
          '<span class="bar-purple"></span><span class="bar-green"></span>' +
        '</div>' +
        '<div class="result-head">' +
          '<p class="eyebrow">Fastest route · ' + (interchanges === 0 ? 'direct' : interchanges + (interchanges === 1 ? ' interchange' : ' interchanges')) + '</p>' +
          '<h3 class="result-title">' + esc(origin.name) + '<span class="route-arrow" aria-hidden="true">→</span>' + esc(destination.name) + '</h3>' +
          '<p class="result-meta">' + result.distanceKm.toFixed(1) + ' km · ' + esc(linesUsed.join(' + ')) + ' · ' + (state.peak ? 'Peak' : 'Off-peak') + ' estimate</p>' +
        '</div>' +
        '<dl class="result-stats">' +
          '<div class="stat"><dt>Total time</dt><dd>' + Math.round(totals.total) + '<span>min</span></dd></div>' +
          '<div class="stat"><dt>Fare</dt><dd>₹' + totals.fare + '<span>est.</span></dd></div>' +
          '<div class="stat"><dt>Stops</dt><dd>' + result.stops + '</dd></div>' +
          '<div class="stat"><dt>Interchanges</dt><dd>' + interchanges + '</dd></div>' +
        '</dl>' +
        '<div class="legs">' + legsHTML + '</div>' +
        '<div class="result-actions">' +
          '<p class="result-foot">Includes ' + totals.waits + ' min platform wait (' + (state.peak ? 'peak' : 'off-peak') + '), ' + result.transferMin + ' min transfer buffer. ' + esc(totals.slab.label) + ' fare slab.</p>' +
          '<button class="btn-ghost" type="button" data-action="copy-link">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
              '<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1"></path>' +
              '<path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1"></path>' +
            '</svg>' +
            '<span class="copy-label">Copy trip link</span>' +
          '</button>' +
        '</div>' +
      '</div>';

      jQuery('#results').html(html);
      updateFareActive(result.distanceKm);
    }

    /* -- Planning --------------------------------------------------- */

    function planJourney(options) {
      var opts = options || {};
      clearError();
      var originId = state.originId;
      var destinationId = state.destinationId;

      if (!originId || !destinationId) {
        showError('Choose both an origin and a destination.', originId ? 'destination' : 'origin');
        return;
      }
      if (originId === destinationId) {
        showError('Origin and destination are the same station. Pick a different station.', 'destination');
        return;
      }

      var result = shortestPath(originId, destinationId);
      if (!result) {
        showError('No route could be found between these two stations.');
        return;
      }

      state.lastResult = result;
      renderResult(result);

      if (mapController) {
        mapController.showRoute(originId, destinationId, result.stationPath);
      }

      var origin = DATA.stations[originId];
      var destination = DATA.stations[destinationId];
      updateMapHint('Route drawn: ' + origin.shortName + ' → ' + destination.shortName + '. Click another station to start a new search.');
      writeHash(originId, destinationId);

      var totals = totalsFor(result);
      addRecent(result, Math.round(totals.total), totals.fare);

      if (opts.scroll) {
        scrollToResults();
      }
    }

    function refreshHintFromState() {
      if (state.originId && state.destinationId) {
        updateMapHint('Both stations selected. Press Plan journey to draw the route.');
      } else if (state.originId) {
        updateMapHint('Origin set to ' + DATA.stations[state.originId].shortName + '. Choose a destination.');
      } else if (state.destinationId) {
        updateMapHint('Destination set to ' + DATA.stations[state.destinationId].shortName + '. Choose an origin.');
      } else {
        updateMapHint(MAP_HINT_DEFAULT);
      }
    }

    function handleOriginSelect(station) {
      state.originId = station ? station.id : null;
      clearError();
      clearResultDisplay();
      updatePreview();
      refreshHintFromState();
    }

    function handleDestinationSelect(station) {
      state.destinationId = station ? station.id : null;
      clearError();
      clearResultDisplay();
      updatePreview();
      refreshHintFromState();
    }

    function handleStationPick(stationId) {
      if (!state.originId || state.destinationId) {
        state.originId = stationId;
        state.destinationId = null;
        originCombo.setStation(stationId, true);
        destinationCombo.clear(true);
        clearError();
        clearResultDisplay();
        updatePreview();
        updateMapHint('Origin set to ' + DATA.stations[stationId].shortName + '. Choose a destination on the map.');
        return;
      }

      if (state.originId === stationId) {
        updateMapHint('That station is already the origin. Choose a different destination.');
        return;
      }

      state.destinationId = stationId;
      destinationCombo.setStation(stationId, true);
      clearError();
      planJourney({ scroll: false });
    }

    function loadTrip(originId, destinationId, peak, scroll) {
      if (!DATA.stations[originId] || !DATA.stations[destinationId]) { return; }
      state.peak = peak === true;
      jQuery('#peak-toggle').prop('checked', state.peak);
      updatePeakHint();
      state.originId = originId;
      state.destinationId = destinationId;
      originCombo.setStation(originId, true);
      destinationCombo.setStation(destinationId, true);
      clearError();
      planJourney({ scroll: scroll !== false });
    }

    function resetJourney() {
      state.originId = null;
      state.destinationId = null;
      state.lastResult = null;
      if (originCombo) { originCombo.clear(true); }
      if (destinationCombo) { destinationCombo.clear(true); }
      clearError();
      jQuery('#results').html(emptyHTML);
      jQuery('#fare-rows tr').removeClass('is-active');
      if (mapController) { mapController.clear(); }
      updateMapHint(MAP_HINT_DEFAULT);
      clearHash();
    }

    function swapTrip() {
      if (!state.originId && !state.destinationId) {
        showError('Choose an origin and a destination before swapping.', 'origin');
        return;
      }
      var previousOrigin = state.originId;
      var previousDestination = state.destinationId;
      state.originId = previousDestination;
      state.destinationId = previousOrigin;

      if (previousDestination) {
        originCombo.setStation(previousDestination, true);
      } else {
        originCombo.clear(true);
      }
      if (previousOrigin) {
        destinationCombo.setStation(previousOrigin, true);
      } else {
        destinationCombo.clear(true);
      }

      clearError();
      if (state.originId && state.destinationId) {
        planJourney({ scroll: false });
      } else {
        clearResultDisplay();
        updatePreview();
        refreshHintFromState();
      }
    }

    function copyRouteLink(button) {
      var $label = jQuery(button).find('.copy-label');
      var url = window.location.href;

      function report(copied) {
        $label.text(copied ? 'Link copied' : 'Copy failed');
        window.setTimeout(function () { $label.text('Copy trip link'); }, 2200);
      }

      function fallbackCopy() {
        var area = document.createElement('textarea');
        area.value = url;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        document.body.appendChild(area);
        area.select();
        var copied = false;
        try {
          copied = document.execCommand('copy');
        } catch (error) {
          copied = false;
        }
        document.body.removeChild(area);
        report(copied);
      }

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function () { report(true); }, fallbackCopy);
      } else {
        fallbackCopy();
      }
    }

    /* -- Wiring ----------------------------------------------------- */

    if (mapController) {
      mapController.onPick = handleStationPick;
      mapController.onReset = resetJourney;
    }

    originCombo = new Combobox({
      id: 'origin',
      input: '#origin-input',
      list: '#origin-listbox',
      clear: '#origin-clear',
      hint: '#origin-hint',
      hintDefault: 'Start typing, or click a station on the map.',
      onSelect: handleOriginSelect
    });

    destinationCombo = new Combobox({
      id: 'destination',
      input: '#destination-input',
      list: '#destination-listbox',
      clear: '#destination-clear',
      hint: '#destination-hint',
      hintDefault: 'Peak and off-peak waits are added separately.',
      onSelect: handleDestinationSelect
    });

    jQuery('#planner-form').on('submit', function (event) {
      event.preventDefault();
      planJourney({ scroll: true });
    });

    jQuery('#swap-btn').on('click', swapTrip);

    jQuery('#peak-toggle').on('change', function () {
      state.peak = jQuery(this).prop('checked');
      updatePeakHint();
      if (state.lastResult) {
        renderResult(state.lastResult);
      }
    });

    jQuery('#results').on('click', '.sample-btn', function () {
      loadTrip(jQuery(this).attr('data-origin'), jQuery(this).attr('data-destination'), false, true);
    });

    jQuery('#results').on('click', '[data-action="copy-link"]', function () {
      copyRouteLink(this);
    });

    jQuery('#recent-list').on('click', '.recent-item', function () {
      loadTrip(
        jQuery(this).attr('data-origin'),
        jQuery(this).attr('data-destination'),
        jQuery(this).attr('data-peak') === '1',
        true
      );
    });

    jQuery('#recent-clear').on('click', function () {
      recentEntries = [];
      persistRecent();
      renderRecent();
    });

    jQuery(window).on('hashchange', function () {
      var next = readHash();
      if (!next) { return; }
      if (next.origin === state.originId && next.destination === state.destinationId && state.lastResult) {
        return;
      }
      loadTrip(next.origin, next.destination, state.peak, false);
    });

    updatePeakHint();

    var deepLink = readHash();
    if (deepLink) {
      loadTrip(deepLink.origin, deepLink.destination, false, false);
    } else {
      updatePreview();
    }
  }

  /* ==================================================================
     07. Network page
     ================================================================== */

  function initNetworkPage() {
    var $purpleBody = jQuery('#purple-table-body');
    var $greenBody = jQuery('#green-table-body');
    if (!$purpleBody.length || !$greenBody.length) { return; }

    var totalKm = DATA.lines.reduce(function (sum, line) { return sum + line.totalKm; }, 0);
    jQuery('[data-stat="stations"]').text(Object.keys(DATA.stations).length);
    jQuery('[data-stat="lines"]').text(DATA.lines.length);
    jQuery('[data-stat="interchanges"]').text(1);
    jQuery('[data-stat="network-km"]').text(totalKm.toFixed(0));

    DATA.lines.forEach(function (line) {
      jQuery('[data-line-count="' + line.id + '"]').text(line.stations.length);
      jQuery('[data-line-km="' + line.id + '"]').text(line.totalKm.toFixed(1));
    });

    function rowHTML(line, station, index) {
      var next = line.stations[index + 1];
      var notes = '—';
      if (station.interchange) {
        notes = '<span class="badge-interchange">Interchange</span> Change for ' + (line.id === 'purple' ? 'Green Line' : 'Purple Line');
      }
      return '<tr' + (station.interchange ? ' class="is-interchange-row"' : '') + '>' +
        '<td class="station-order" data-label="Order">' + (index + 1) + '</td>' +
        '<td class="station-name" data-label="Station">' + esc(station.name) + '</td>' +
        '<td class="seg-km" data-label="To next station">' + (next ? station.kmToNext.toFixed(1) + ' km' : 'Terminus') + '</td>' +
        '<td data-label="Notes">' + notes + '</td>' +
      '</tr>';
    }

    jQuery('#purple-table-body').html(DATA.lineById.purple.stations.map(function (station, index) {
      return rowHTML(DATA.lineById.purple, station, index);
    }).join(''));

    jQuery('#green-table-body').html(DATA.lineById.green.stations.map(function (station, index) {
      return rowHTML(DATA.lineById.green, station, index);
    }).join(''));
  }

  /* ==================================================================
     Boot
     ================================================================== */

  jQuery(function () {
    if (jQuery('#planner-form').length) {
      initPlannerPage();
    }
    if (jQuery('#purple-table-body').length) {
      initNetworkPage();
    }
  });
})();
