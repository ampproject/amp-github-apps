// Before this date only dist/v0.js was collected.
const MIN_DATE = new Date('2019-10-23T18:00:00Z');
const CSV_FILE_NAME =
  'https://storage.googleapis.com/amp-bundle-size-chart/bundle-sizes.csv';
const IGNORE_FILES = new Set(['dist/v0/amp-viz-vega-0.1.js']);

const margin = {top: 30, right: 50, bottom: 30, left: 50};
const width = 960 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

// Create basic chart placeholder and axes objects.
const svg = d3
  .select('#chart')
  .append('svg')
  .attr('width', width + margin.left + margin.right)
  .attr('height', height + margin.top + margin.bottom)
  .append('g')
  .attr('transform', `translate(${margin.left},${margin.top})`);
svg
  .append('rect')
  .attr('width', width)
  .attr('height', height)
  .attr('opacity', 0);

const x = d3.scaleTime().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

// Create placeholders for the hover behavior.
const hoverLine = svg
  .append('path')
  .classed('hover-line', true)
  .attr('display', 'none');
const dot = svg.append('g').attr('display', 'none').classed('dot', true);
dot.append('circle').attr('r', 2.5);
const dotAnchor = dot.append('a');
const dotFileNameText = dotAnchor
  .append('text')
  .style('font-size', '.8em')
  .attr('y', -20);
const dotMessageText = dotAnchor
  .append('text')
  .style('font-size', '.6em')
  .attr('y', -8);

// Event listeners for the hover behavior.
svg
  .on('mousemove', moved)
  .on('mouseenter', () => {
    dot.attr('display', null);
    hoverLine.attr('display', null);
  })
  .on('mouseleave', () => {
    dot.attr('display', 'none');
    hoverLine.attr('display', 'none');
    svg.selectAll('.line.hover').classed('hover', false);
  });

// Initialize data from external CSV file.
let data;
const filesMax = {};
d3.csv(CSV_FILE_NAME).then(data_ => {
  data = data_;
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
        filesMax[key] = Math.max(filesMax[key] || 0, d[key]);
      }
    }
  });
  data = data.filter(d => d.date > MIN_DATE);
  data.sort((a, b) => a.date - b.date);
  data.columns = data_.columns.filter(key => !IGNORE_FILES.has(key));

  // The x axis is the time and it does not change with filtering.
  x.domain(d3.extent(data, d => d.date));

  // Create the axis graphics. Set the x axis, but only prepare the y axis
  // since it changes with the filter.
  svg
    .append('g')
    .classed('axis axis-x', true)
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x));
  svg.append('g').classed('axis axis-y', true);

  updateFilter();
});

/**
 * Updates the y axis based on the filter.
 *
 * @param {string} filter text that should be in the file name
 */
function updateYAxis(filter) {
  let yMax = 0;
  for (const key of data.columns) {
    if (key.startsWith('dist/') && key.includes(filter)) {
      yMax = Math.max(yMax, filesMax[key]);
    }
  }
  y.domain([0, yMax]);
  svg.select('.axis-y').call(d3.axisLeft(y));
}

/**
 * Draws all bundle-size lines based on the filter.
 */
function updateFilter() {
  const filter = document.querySelector('#filter').value;
  svg.selectAll('.line').remove(); // Remove any previously added lines.
  updateYAxis(filter);

  for (const key of data.columns) {
    if (key.startsWith('dist/') && key.includes(filter)) {
      const valueline = d3
        .line()
        .x(d => x(d.date))
        .y(d => y(d[key]))
        .curve(d3.curveBasis);
      svg
        .append('path')
        .data([data])
        .classed('line', true)
        .attr('data-file', key)
        .attr('d', valueline);
    }
  }
}

/**
 * Event handler for when the mouse moves over the chart.
 */
function moved() {
  const filter = document.querySelector('#filter').value;
  if (!data || !data.columns.some(key => key.includes(filter))) {
    // Ignore while still loading the data or if the filter results in an empty
    // set.
    return;
  }

  d3.event.preventDefault();
  // Convert mouse event to x/y values in the data's value space.
  const x0 = x.invert(d3.event.offsetX - margin.left);
  const y0 = y.invert(d3.event.offsetY - margin.top);

  // Find the closest data row to the pointer.
  const dataIndex = d3.bisector(d => d.date).left(data, x0, 1, data.length - 1);
  const leftDataRow = data[dataIndex - 1];
  const rightDataRow = data[dataIndex];
  const closestDataRow =
    x0 - leftDataRow.date > rightDataRow.date - x0 ? rightDataRow : leftDataRow;

  // Find the closest data column (file name) to the pointer.
  const closestDataFile = data.columns
    .filter(key => key.includes(filter))
    .reduce((a, b) =>
      Math.abs(closestDataRow[a] - y0) < Math.abs(closestDataRow[b] - y0)
        ? a
        : b
    );

  // Set the selected line to have the .hover class for effect.
  svg.selectAll('.line.hover').classed('hover', false);
  svg.select(`.line[data-file="${closestDataFile}"]`).classed('hover', true);

  // Move the hover line and set the text for the link.
  const fileName = closestDataFile.substring(5);
  const bundleSize = closestDataRow[closestDataFile];

  hoverLine.attr('d', function () {
    let d = 'M' + x(closestDataRow.date) + ',' + height;
    d += ' ' + x(closestDataRow.date) + ',' + 0;
    return d;
  });
  dot.attr(
    'transform',
    `translate(${x(closestDataRow.date)},${y(bundleSize)})`
  );
  dotAnchor.attr(
    'href',
    `https://github.com/ampproject/amphtml/commit/${closestDataRow.sha}`
  );
  dotFileNameText.text(`${fileName}: ${bundleSize} KB`);
  dotMessageText.text(closestDataRow.message);
}

// Event listener for changing the filter text.
document.querySelector('#filter').addEventListener('input', updateFilter);
