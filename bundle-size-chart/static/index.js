const CSV_FILE_NAME =
  'https://storage.googleapis.com/amp-bundle-size-chart/bundle-sizes.csv';
const IGNORE_FILES = new Set([
  // Deleted:
  'dist/v0/amp-viz-vega-0.1.js',
  'dist/v0/amp-viz-vega-0.1.mjs',
]);

const margin = {left: 60, top: 36, right: 24, bottom: 48};

/**
 * @param {function(...*)} fn
 * @param {number} wait
 * @return {function(...*)}
 */
function debounce(fn, wait) {
  let timeout = null;
  return (...args) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      fn(...args);
    }, wait);
  };
}

/**
 * @param {!Element} element
 * @param {string} eventType
 */
function cancelNext(element, eventType) {
  const capture = e => {
    e.preventDefault();
    e.stopPropagation();
    element.removeEventListener(eventType, capture, true);
  };
  element.addEventListener(eventType, capture, true);
}

const max = {};

let rangeStart;
let rangeEnd;
let width;
let height;
let x;
let y;

const clearRangeButton = document.querySelector('#clear-range');
const queryInput = document.querySelector('#query');
const container = document.querySelector('#chart');

const chart = d3.select(container);
const svg = chart.append('svg').append('g');

const axisX = svg.append('g').classed('axis axis-x', true);
const axisY = svg.append('g').classed('axis axis-y', true);

const indicator = svg
  .append('rect')
  .classed('indicator', true)
  .attr('y', margin.top)
  .attr('display', 'none');

const dot = svg.append('g').attr('display', 'none').classed('dot', true);
dot.append('circle').attr('r', 4);

const dotAnchor = dot.append('a').attr('target', '_blank');

// Invisible vertical rect to force clickable area on dot.
dotAnchor
  .append('rect')
  .attr('width', 20)
  .attr('height', 70)
  .attr('opacity', 0)
  .attr('y', -30)
  .attr('x', -10);

const dotSizeText = dotAnchor
  .append('text')
  .style('font-size', '1em')
  .style('font-weight', '700');
const dotMessageText = dotAnchor.append('text').style('font-size', '1em');
const dotFileNameText = dotAnchor
  .append('text')
  .style('font-size', '1em')
  .style('font-weight', '700');

// Event listeners for the hover behavior.
chart
  .on('pointermove', moved)
  .on('pointerdown', startSelection)
  .on('mouseleave', () => {
    if (isSelecting) {
      return;
    }
    dot.attr('display', 'none');
    indicator.attr('display', 'none');
    svg.selectAll('.line.hover').classed('hover', false);
  });

// Attach `pointerup` to window so that it's fired even if pointer is outside
// viewport.
d3.select(window).on('pointerup', applySelection);

/**
 */
function redraw() {
  const rect = container.getBoundingClientRect();

  width = rect.width - margin.left - margin.right;
  height = rect.height - margin.top - margin.bottom;

  chart.select('svg').attr('width', rect.width).attr('height', rect.height);

  svg.attr('transform', `translate(${margin.left},${margin.top})`);

  updateAxes();

  svg.selectAll('.line').remove();
  for (const key of filteredData.columns) {
    const valueline = d3
      .line()
      .x(d => x(d.date))
      .y(d => y(d[key]))
      .curve(d3.curveLinear);
    svg
      .insert('path', '.dot')
      .data([filteredData])
      .classed('line', true)
      .attr('data-file', key)
      .attr('d', valueline);
  }
}

/**
 */
function updateAxes() {
  if (!filteredData.length) {
    svg.selectAll('.axis').attr('display', 'none');
    return;
  }
  svg.selectAll('.axis').attr('display', null);

  x = d3.scaleTime().range([0, width]);
  y = d3.scaleLinear().range([height, 0]);

  const xMin = filteredData[0].date;
  const xMax = filteredData[filteredData.length - 1].date;
  x.domain([xMin, xMax]);

  let yMax = Math.max(0, ...filteredData.columns.map(k => max[k]));
  const yTickFactor = yMax <= 15 ? 1 : yMax <= 36 ? 2 : 5;
  yMax = Math.ceil(yMax / yTickFactor) * yTickFactor;

  y.domain([0, yMax]);

  const deltaDays = Math.abs(xMin - xMax) / (1000 * 60 * 60 * 24);
  const xTickUnit =
    deltaDays >= 14
      ? deltaDays >= 60
        ? d3.timeMonth
        : d3.timeWeek
      : d3.timeDay;
  const xTickFormat =
    xTickUnit === d3.timeMonth ? d3.timeFormat('%B') : d3.timeFormat('%B %d');
  axisX
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(xTickFormat).ticks(xTickUnit));

  axisY.call(g => {
    const ticks = Math.ceil(yMax / yTickFactor);
    g.call(d3.axisRight(y).ticks(ticks).tickSize(width));
    g.selectAll('.tick text').attr('x', -36).attr('dy', 2);
  });
}

/**
 * @param {number} offsetX
 * @param {number} offsetY
 * @return {{x: number, y: number, row: Object<string, *>, column: string}}
 */
function getClosestByPoint(offsetX, offsetY) {
  const filter = queryInput.value;
  if (!filteredData || !filteredData.length) {
    return;
  }

  // Convert mouse event to x/y values in the data's value space.
  const x0 = x.invert(Math.max(0, offsetX - margin.left));
  const y0 = y.invert(offsetY - margin.top);

  // Find the closest data row to the pointer.
  const dataIndex = d3
    .bisector(d => d.date)
    .left(filteredData, x0, 1, filteredData.length - 1);
  const left = filteredData[dataIndex - 1];
  const right = filteredData[dataIndex];
  const row = x0 - left.date > right.date - x0 ? right : left;

  // Find the closest data column (file name) to the pointer.
  const column = filteredData.columns
    .filter(key => key.includes(filter))
    .reduce((a, b) => (Math.abs(row[a] - y0) < Math.abs(row[b] - y0) ? a : b));

  return {x: x(row.date), y: y(row[column]), row, column};
}

let isSelecting = false;
let selectionStart;
let selectionEnd;

/**
 */
function startSelection() {
  isSelecting = true;
  selectionEnd = null;
  selectionStart = getClosestByPoint(d3.event.offsetX, d3.event.offsetY);
}

/**
 */
function restartSelection() {
  if (!selectionEnd) {
    return;
  }
  setIndicator(selectionEnd.x, 1);
  selectionStart = selectionEnd;
  selectionEnd = null;
}

/**
 */
function applySelection() {
  if (!isSelecting) {
    return;
  }
  isSelecting = false;
  if (selectionEnd && selectionStart) {
    if (selectionStart.row.date > selectionEnd.row.date) {
      const temp = selectionStart;
      selectionStart = selectionEnd;
      selectionEnd = temp;
    }
    if (selectionStart.x !== selectionEnd.x) {
      // Cancel upcoming click to prevent link navigation.
      cancelNext(container, 'click');
      setRange(selectionStart.row.date, selectionEnd.row.date);
    }
  }
  selectionEnd = null;
  selectionStart = null;
}

/**
 * @param {Date} startDate
 * @param {Date} endDate
 */
function setRange(startDate, endDate) {
  const daysAgoChecked = document.querySelector('[name=days-ago]:checked');
  if (daysAgoChecked) {
    daysAgoChecked.checked = false;
  }
  rangeStart = startDate;
  rangeEnd = endDate;
  updateOnChange();
}

/**
 */
function updateRangeChip() {
  const chip = document.querySelector('.range-chip');
  const label = document.querySelector('.range-chip > span');
  if (!rangeStart || !rangeEnd) {
    label.textContent = '';
    chip.classList.add('hidden');
    return;
  }
  const left = shortDateLabel(rangeStart);
  const right = shortDateLabel(rangeEnd);
  label.textContent = left === right ? left : `${left}—${right}`;
  chip.classList.remove('hidden');
}

/**
 * @param {Date} date
 * @return {string}
 */
function shortDateLabel(date) {
  return date.toLocaleDateString('en-us', {month: 'short', day: 'numeric'});
}

/**
 * Event handler for when the mouse moves over the chart.
 */
function moved() {
  if (!d3.event) {
    return;
  }

  const closest = getClosestByPoint(d3.event.offsetX, d3.event.offsetY);
  if (!closest) {
    return;
  }

  const {row, column} = closest;

  let dragDelta = 0;
  if (isSelecting) {
    selectionEnd = closest;
    dragDelta = Math.abs(selectionEnd.x - selectionStart.x);
  }

  setIndicator(
    isSelecting ? Math.min(selectionStart.x, selectionEnd.x) : closest.x,
    dragDelta
  );

  svg.selectAll('.line.hover').classed('hover', false);
  svg.selectAll(`.line[data-file='${column}']`).classed('hover', true);

  const dotX = closest.x;
  const dotY = closest.y;

  dot.attr('display', null).attr('transform', `translate(${dotX},${dotY})`);

  dotAnchor.attr(
    'href',
    `https://github.com/ampproject/amphtml/commit/${row.sha}`
  );

  const bundleSize = row[column];
  dotSizeText.text(`${bundleSize.toFixed(2)} KB`).attr('y', -14);

  const fileName = column.substring(5);
  dotFileNameText.text(fileName).attr('y', 24);

  dotMessageText.text(row.message).attr('y', 46);

  nudgeFromCenter(dotX, dotSizeText);
  nudgeFromCenter(dotX, dotFileNameText);
  nudgeFromCenter(dotX, dotMessageText);
}

/**
 * @param {number} center
 * @param {Object} text d3 node
 */
function nudgeFromCenter(center, text) {
  const half = text.node().getComputedTextLength() / 2;
  const padding = 12;
  const offset =
    center < half + padding
      ? -center + half + padding
      : width - center - padding < half
      ? width - center - padding - half
      : 0;
  text.attr('x', offset);
}

/**
 * @param {number} x
 * @param {number} width
 */
function setIndicator(x, width) {
  indicator
    .classed('range', width > 1)
    .attr('display', null)
    .attr('x', x)
    .attr('y', 0)
    .attr('width', Math.max(1, width))
    .attr('height', height);
}

/**
 */
function setStateFromHash() {
  const parts = window.location.hash
    .substr(1)
    .split('&')
    .map(decodeURIComponent);
  const q = parts[0];
  const s = parts[1];
  const e = parts[2];
  if (q) {
    queryInput.value = q;
  }
  if (s) {
    rangeStart = deserializeDatetime(s);
  }
  if (e) {
    rangeEnd = deserializeDatetime(e, /* ceil */ true);
  }
}

/**
 * @param {string} query
 * @return {string}
 */
function serializeHashState(query) {
  return (
    `#${encodeURIComponent(query)}` +
    (rangeStart ? `&${serializeDatetime(rangeStart)}` : '') +
    (rangeEnd ? `&${serializeDatetime(rangeEnd)}` : '')
  );
}

/**
 * @param {Date} date
 * @return {string}
 */
function serializeDatetime(date) {
  const isoString = date.toISOString();
  return isoString.substring(0, isoString.length - ':00.000Z'.length);
}

/**
 * @param {string} string
 * @param {boolean=} ceil
 * @return {Date}
 */
function deserializeDatetime(string, ceil) {
  return new Date(`${string}:${ceil ? '59' : '00'}.000Z`);
}

setStateFromHash();
document.querySelector('main').classList.remove('hidden');

let data;
let filteredData;

/**
 * @param {Object[]} data
 * @return {Object[]}
 */
function initializeData(data) {
  data.forEach(d => {
    d.date = d3.isoParse(d.date);
    for (const key of Object.keys(d)) {
      if (key.startsWith('dist/')) {
        if (IGNORE_FILES.has(key)) {
          delete d[key];
          continue;
        }
        // Convert string value to number for files and collect the maximum
        // bundle-size of each file.
        d[key] = Number(d[key]);
        max[key] = Math.max(max[key] || 0, d[key]);
      }
    }
  });
  data.sort((a, b) => a.date - b.date);
  data.columns = data.columns.filter(key => !IGNORE_FILES.has(key));
  return data;
}

/**
 */
function updateFilteredData() {
  const query = queryInput.value.trim();
  filteredData =
    rangeStart && rangeEnd
      ? data.filter(d => d.date >= rangeStart && d.date <= rangeEnd)
      : [...data];
  filteredData.columns = data.columns.filter(
    key => key.startsWith('dist/') && key.includes(query)
  );
  setHashState(query);
}

/**
 */
function clearRange() {
  rangeStart = null;
  rangeEnd = null;
  updateOnChange();
}

/**
 */
function updateOnChange() {
  updateRangeChip();
  updateFilteredData();
  redraw();
  moved();
}

let prevHash = window.location.hash;

/**
 * @param {string} query
 */
function setHashState(query) {
  const hash = serializeHashState(query);
  if (prevHash !== hash) {
    window.location.href = hash;
    prevHash = hash;
  }
}

/**
 */
function onHashChange() {
  if (prevHash !== window.location.hash) {
    prevHash = window.location.hash;
    updateOnChange();
  }
}

window.addEventListener('hashchange', onHashChange, false);
window.addEventListener('resize', redraw);
window.addEventListener('keyup', e => {
  if (e.key === 'Escape') {
    restartSelection();
  }
});

clearRangeButton.addEventListener('click', clearRange);

const updateOnQueryInput = debounce(updateOnChange);
queryInput.addEventListener('input', updateOnQueryInput);

d3.csv(CSV_FILE_NAME).then(data_ => {
  data = initializeData(data_);
  updateOnChange();
});
