// Draw Bitcoin Halving Chart with vertical lines and shaded regions - CORRIGIDO
function halvingDraw({
	divId = 'halving-chart',
	halvingTimestamps = [],
	nextHalving = null,
	width = 800,
	height = 400,
	btcData = null
}) {
	const chartDiv = document.getElementById(divId);
	if (!chartDiv) return;
	
	chartDiv.style.height = height + 'px';
	chartDiv.style.width = '100%';
	
	const margin = {top: 40, right: 30, bottom: 60, left: 60};
	const halvings = halvingTimestamps.map(ts => new Date(ts * 1000));
	
	// X scale: from first halving - 600 days to next halving + 600 days
	const minDate = new Date(halvings[0].getTime() - 600 * 24 * 3600 * 1000);
	const maxDate = new Date(nextHalving.getTime() + 600 * 24 * 3600 * 1000);
	const x = d3.scaleTime()
		.domain([minDate, maxDate])
		.range([margin.left, width - margin.right]);
	
	// Limpar conteúdo anterior
	d3.select(`#${divId}`).selectAll('*').remove();
	
	// Criar SVG
	const svg = d3.select(`#${divId}`)
		.append('svg')
		.attr('width', width)
		.attr('height', height);
	
	// Primeiro desenhar as áreas coloridas (fundo)
	halvings.forEach((halving, i) => {
		const beforeStart = new Date(halving.getTime() - 500 * 24 * 3600 * 1000);
		const afterEnd = new Date(halving.getTime() + 500 * 24 * 3600 * 1000);
		
		// Área antes do halving (azul claro)
		svg.append('rect')
			.attr('x', Math.max(margin.left, x(beforeStart)))
			.attr('y', margin.top)
			.attr('width', Math.max(0, x(halving) - Math.max(margin.left, x(beforeStart))))
			.attr('height', height - margin.top - margin.bottom)
			.attr('fill', '#e0f7fa')
			.attr('opacity', 0.15);
		
		// Área após o halving (laranja claro)
		svg.append('rect')
			.attr('x', x(halving))
			.attr('y', margin.top)
			.attr('width', Math.max(0, Math.min(width - margin.right, x(afterEnd)) - x(halving)))
			.attr('height', height - margin.top - margin.bottom)
			.attr('fill', '#ffe0b2')
			.attr('opacity', 0.15);
	});
	
	// Desenhar linha do preço do BTC se fornecida
	if (btcData && btcData.timestamp && btcData.price && btcData.timestamp.length > 0) {
		// Filtrar dados dentro do range do gráfico
		const filteredData = btcData.timestamp
			.map((date, i) => ({date, price: btcData.price[i]}))
			.filter(d => d.date >= minDate && d.date <= maxDate && d.price > 0);
		
		if (filteredData.length > 0) {
			// Y scale para preço BTC (logarítmica)
			const minPrice = Math.max(0.01, d3.min(filteredData, d => d.price));
			const maxPrice = d3.max(filteredData, d => d.price);
			const btcY = d3.scaleLog()
				.domain([minPrice, maxPrice])
				.range([height - margin.bottom, margin.top]);
			
			// Linha principal do BTC (laranja)
			const btcLine = d3.line()
				.x(d => x(d.date))
				.y(d => btcY(d.price))
				.curve(d3.curveMonotoneX);
			
			svg.append('path')
				.datum(filteredData)
				.attr('fill', 'none')
				.attr('stroke', '#f7931a')
				.attr('stroke-width', 2)
				.attr('d', btcLine);
			
			// Desenhar linhas coloridas para períodos específicos
			halvings.forEach((halving, i) => {
				// 500 dias antes do halving (azul)
				const beforeStart = new Date(halving.getTime() - 500 * 24 * 3600 * 1000);
				const beforeData = filteredData.filter(d => d.date >= beforeStart && d.date <= halving);
				
				if (beforeData.length > 1) {
					svg.append('path')
						.datum(beforeData)
						.attr('fill', 'none')
						.attr('stroke', '#1976d2')
						.attr('stroke-width', 3)
						.attr('d', btcLine);
				}
				
				// 500 dias após o halving (verde)
				const afterEnd = new Date(halving.getTime() + 500 * 24 * 3600 * 1000);
				const afterData = filteredData.filter(d => d.date >= halving && d.date <= afterEnd);
				
				if (afterData.length > 1) {
					svg.append('path')
						.datum(afterData)
						.attr('fill', 'none')
						.attr('stroke', '#388e3c')
						.attr('stroke-width', 3)
						.attr('d', btcLine);
				}
			});
			
			// Adicionar eixo Y para preço BTC
			svg.append('g')
				.attr('transform', `translate(${margin.left}, 0)`)
				.call(d3.axisLeft(btcY).tickFormat(d => `$${d}`));
			
			// Label do eixo Y
			svg.append('text')
				.attr('transform', 'rotate(-90)')
				.attr('y', margin.left - 50)
				.attr('x', 0 - height / 2)
				.attr('dy', '1em')
				.style('text-anchor', 'middle')
				.style('fill', '#f7931a')
				.text('BTC Price (USD, log scale)');
		}
	}
	
	// Desenhar linhas verticais dos halvings
	halvings.forEach((halving, i) => {
		svg.append('line')
			.attr('x1', x(halving))
			.attr('x2', x(halving))
			.attr('y1', margin.top)
			.attr('y2', height - margin.bottom)
			.attr('stroke', '#d32f2f')
			.attr('stroke-width', 2);
		
		// Labels dos halvings
		svg.append('text')
			.attr('x', x(halving))
			.attr('y', margin.top - 10)
			.attr('text-anchor', 'middle')
			.attr('fill', '#d32f2f')
			.style('font-size', '0.8em')
			.text(`Halving ${i + 1}`);
	});
	
	// Desenhar linha vertical para próximo halving
	if (nextHalving) {
		svg.append('line')
			.attr('x1', x(nextHalving))
			.attr('x2', x(nextHalving))
			.attr('y1', margin.top)
			.attr('y2', height - margin.bottom)
			.attr('stroke', '#1976d2')
			.attr('stroke-width', 2)
			.attr('stroke-dasharray', '4,2');
		
		svg.append('text')
			.attr('x', x(nextHalving))
			.attr('y', margin.top - 10)
			.attr('text-anchor', 'middle')
			.attr('fill', '#1976d2')
			.style('font-size', '0.8em')
			.text('Next Halving');
	}
	
	// Adicionar eixo X (tempo)
	svg.append('g')
		.attr('transform', `translate(0, ${height - margin.bottom})`)
		.call(d3.axisBottom(x).tickFormat(d3.timeFormat('%Y')));
	
	// Título do gráfico
	svg.append('text')
		.attr('x', width / 2)
		.attr('y', margin.top - 20)
		.attr('text-anchor', 'middle')
		.text('Bitcoin Halvings')
		.style('font-weight', 'bold');
}
// scripts/chart_draw.js
// All chart drawing functions for DEBASE

// Draw a brutalist D3 line chart - CSS-driven, mobile-first, NO DOTS
// Modified to accept an array of data objects for multiple lines
function drawCombinedChart(
	dataSets,
	divId = "combined-gold-chart",
	title = "PREÇO DO OURO",
	labelLeft = "USD $"
) {
	const chartDiv = document.getElementById(divId);

	if (!chartDiv) {
		console.log(`Chart container with id ${divId} not found.`);
		return;
	}

	const containerWidth = chartDiv.clientWidth;
	const containerHeight =
		chartDiv.clientHeight > 0
			? chartDiv.clientHeight
			: window.innerWidth <= 600
			? 400
			: 400;

	const internalWidth = containerWidth;
	const internalHeight =
		window.innerWidth <= 400 ? 450 : window.innerWidth <= 600 ? 400 : 400;

	const margin = {
		top: window.innerWidth <= 400 ? 60 : window.innerWidth <= 600 ? 50 : 40,
		right:
			window.innerWidth <= 400 ? 20 : window.innerWidth <= 600 ? 25 : 30,
		bottom:
			window.innerWidth <= 400 ? 80 : window.innerWidth <= 600 ? 70 : 60,
		left:
			window.innerWidth <= 400 ? 55 : window.innerWidth <= 600 ? 50 : 60,
	};

	// Clear previous chart
	d3.select(`#${divId}`).selectAll("*").remove();

	// Prepare data for all lines and determine combined domains
	let allDates = [];
	let allPrices = [];

	dataSets.forEach((dataSet) => {
		dataSet.parsedData = dataSet.data.timestamp.map((d, i) => ({
			date: new Date(d),
			price: dataSet.data.price[i],
		}));
		allDates = allDates.concat(dataSet.parsedData.map((d) => d.date));
		allPrices = allPrices.concat(dataSet.parsedData.map((d) => d.price));
	});

	// Create SVG
	const svg = d3
		.select(`#${divId}`)
		.append("svg")
		.attr("width", internalWidth)
		.attr("height", internalHeight);

	// Scales
	const x = d3
		.scaleTime()
		.domain(d3.extent(allDates))
		.range([margin.left, internalWidth - margin.right]);

	const y = d3
		.scaleLinear()
		.domain([0, d3.max(allPrices) * 1.05])
		.nice()
		.range([internalHeight - margin.bottom, margin.top]);

	// Grid lines
	const numXTicks =
		window.innerWidth <= 400 ? 3 : window.innerWidth <= 600 ? 4 : 6;
	const numYTicks =
		window.innerWidth <= 400 ? 4 : window.innerWidth <= 600 ? 5 : 6;

	// X-axis grid
	svg.append("g")
		.attr("class", "grid")
		.attr("transform", `translate(0,${internalHeight - margin.bottom})`)
		.call(
			d3
				.axisBottom(x)
				.ticks(numXTicks)
				.tickSize(-(internalHeight - margin.top - margin.bottom))
				.tickFormat("")
		);

	// Y-axis grid
	svg.append("g")
		.attr("class", "grid")
		.attr("transform", `translate(${margin.left},0)`)
		.call(
			d3
				.axisLeft(y)
				.ticks(numYTicks)
				.tickSize(-(internalWidth - margin.left - margin.right))
				.tickFormat("")
		);

	// X-axis
	const xAxis = svg
		.append("g")
		.attr("transform", `translate(0,${internalHeight - margin.bottom})`)
		.call(d3.axisBottom(x).ticks(numXTicks));

	if (window.innerWidth <= 600) {
		xAxis
			.selectAll("text")
			.attr("transform", "rotate(-45)")
			.style("text-anchor", "end");
	}

	// Y-axis
	svg.append("g")
		.attr("transform", `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).ticks(numYTicks));

	// Y-axis label
	svg.append("text")
		.attr("transform", "rotate(-90)")
		.attr(
			"y",
			window.innerWidth <= 400 ? 10 : window.innerWidth <= 600 ? 10 : 20
		)
		.attr("x", 0 - internalHeight / 2)
		.attr("dy", "-1em")
		.style("text-anchor", "middle")
		.text(labelLeft);

	// Line generator
	const line = d3
		.line()
		.x((d) => x(d.date))
		.y((d) => y(d.price))
		.curve(d3.curveLinear);

	// Draw each line
	dataSets.forEach((dataSet) => {
		svg.append("path")
			.datum(dataSet.parsedData)
			.attr("class", `line ${dataSet.cssClass}`) // Add a specific class for styling
			.attr("fill", "none")
			.attr("stroke", dataSet.color) // Use the assigned color
			.attr("d", line);
	});

	// Title
	svg.append("text")
		.attr("x", internalWidth / 2)
		.attr(
			"y",
			window.innerWidth <= 400 ? 30 : window.innerWidth <= 600 ? 25 : 20
		)
		.attr("text-anchor", "middle")
		.text(title.toUpperCase());

	// Add Legend
	const legend = svg
		.append("g")
		.attr("class", "legend")
		.attr(
			"transform",
			`translate(${margin.left}, ${internalHeight - margin.bottom + 40})`
		); // Position legend below the chart

	dataSets.forEach((d, i) => {
		const legendRow = legend
			.append("g")
			.attr("transform", `translate(0, ${i * 20})`); // Spacing between legend items

		legendRow
			.append("rect")
			.attr("width", 10)
			.attr("height", 10)
			.attr("fill", d.color);

		legendRow
			.append("text")
			.attr("x", 20)
			.attr("y", 10)
			.attr("text-anchor", "start")
			.style("font-size", "0.8em")
			.text(d.label);
	});
}

// Function to draw Dollar Purchasing Power Chart
function drawDollarPurchasingPowerChart(purchasingPowerData) {
	// Validate input data
	if (!purchasingPowerData || !purchasingPowerData.timestamp || !purchasingPowerData.value) {
		console.error("Error: Invalid or missing purchasingPowerData");
		return;
	}
	if (purchasingPowerData.timestamp.length !== purchasingPowerData.value.length) {
		console.error("Error: Mismatch between timestamp and value arrays");
		return;
	}

	// Transform and validate data
	const data = purchasingPowerData.timestamp
		.map((d, i) => {
			const date = new Date(d);
			const value = purchasingPowerData.value[i];
			
			// Log problematic data points
			if (isNaN(date) || !isFinite(value) || value <= 0) {
				console.warn("Invalid data point:", { timestamp: d, value: value, date: date });
			}
			
			return { date, value };
		})
		.filter(d => !isNaN(d.date) && isFinite(d.value) && d.value > 0);

	console.log("Filtered data length:", data.length);
	console.log("First few data points:", data.slice(0, 5));

	if (data.length === 0) {
		console.error("Error: No valid data points after filtering");
		return;
	}

	const chartDiv = document.getElementById("usd-purchasing-power-chart");
	if (!chartDiv) {
		console.error("Error: Chart container #usd-purchasing-power-chart not found");
		return;
	}

	// Container dimensions
	const containerWidth = chartDiv.clientWidth || window.innerWidth;
	const containerHeight = chartDiv.clientHeight > 0 ? chartDiv.clientHeight : (window.innerWidth <= 600 ? 400 : 400);
	const internalWidth = containerWidth;
	const internalHeight = window.innerWidth <= 400 ? 450 : window.innerWidth <= 600 ? 400 : 400;

	const margin = {
		top: window.innerWidth <= 400 ? 60 : window.innerWidth <= 600 ? 50 : 40,
		right: window.innerWidth <= 400 ? 20 : window.innerWidth <= 600 ? 25 : 30,
		bottom: window.innerWidth <= 400 ? 80 : window.innerWidth <= 600 ? 70 : 60,
		left: window.innerWidth <= 400 ? 70 : window.innerWidth <= 600 ? 65 : 80,
	};

	// Clear previous content
	d3.select("#usd-purchasing-power-chart").selectAll("*").remove();

	const svg = d3
		.select("#usd-purchasing-power-chart")
		.append("svg")
		.attr("width", internalWidth)
		.attr("height", internalHeight);

	// Scales
	const x = d3
		.scaleTime()
		.domain(d3.extent(data, (d) => d.date))
		.range([margin.left, internalWidth - margin.right]);

	const y = d3
		.scaleLog()
		.domain([Math.max(d3.min(data, (d) => d.value) * 0.8, 0.01), 1.05])
		.range([internalHeight - margin.bottom, margin.top])
		.clamp(true);

	// X grid
	svg.append("g")
		.attr("class", "grid")
		.attr("transform", `translate(0,${internalHeight - margin.bottom})`)
		.call(
			d3
				.axisBottom(x)
				.ticks(6)
				.tickSize(-(internalHeight - margin.top - margin.bottom))
				.tickFormat("")
		);

	// Y grid
	svg.append("g")
		.attr("class", "grid")
		.attr("transform", `translate(${margin.left},0)`)
		.call(
			d3
				.axisLeft(y)
				.ticks(6)
				.tickSize(-(internalWidth - margin.left - margin.right))
				.tickFormat("")
		);

	// X axis
	const xAxis = svg
		.append("g")
		.attr("transform", `translate(0,${internalHeight - margin.bottom})`)
		.call(d3.axisBottom(x).ticks(6));

	if (window.innerWidth <= 600) {
		xAxis
			.selectAll("text")
			.attr("transform", "rotate(-45)")
			.style("text-anchor", "end");
	}

	// Y axis - CORREÇÃO: remover .chair_drawing
	svg.append("g")
		.attr("transform", `translate(${margin.left},0)`)
		.call(
			d3
				.axisLeft(y)
				.ticks(6)
				.tickFormat((d) => d.toFixed(2))
		);

	// Y label
	svg.append("text")
		.attr("transform", "rotate(-90)")
		.attr(
			"y",
			window.innerWidth <= 400 ? 10 : window.innerWidth <= 600 ? 10 : 15
		)
		.attr("x", 0 - internalHeight / 2)
		.attr("dy", "-1em")
		.style("text-anchor", "middle")
		.text("Relative Purchasing Power");

	// Line
	const line = d3
		.line()
		.x((d) => x(d.date))
		.y((d) => y(d.value))
		.curve(d3.curveLinear);

	svg.append("path")
		.datum(data)
		.attr("class", "line usd-purchasing-power-line")
		.attr("fill", "none")
		.attr("stroke", "#FFFFFF") // Changed to white for visibility
		.attr("stroke-width", window.innerWidth <= 400 ? 10 : window.innerWidth <= 600 ? 8 : 3)
		.attr("d", line);

	// Title
	svg.append("text")
		.attr("x", internalWidth / 2)
		.attr(
			"y",
			window.innerWidth <= 400 ? 30 : window.innerWidth <= 600 ? 25 : 20
		)
		.attr("text-anchor", "middle")
		.style("font-weight", "bold")
		.text("DOLLAR PURCHASING POWER (CPI)");
}

// Function to draw relative growth chart with improved logarithmic scaling
function drawRelativeGrowthChart(
	dataSets,
	divId = "crypto-relative-growth-usd-chart"
) {
	const chartDiv = document.getElementById(divId);
	if (!chartDiv) {
		console.log(`Chart container with id ${divId} not found.`);
		return;
	}

	const containerWidth = chartDiv.clientWidth;
	const containerHeight =
		chartDiv.clientHeight > 0
			? chartDiv.clientHeight
			: window.innerWidth <= 600
			? 400
			: 400;

	const internalWidth = containerWidth;
	const internalHeight =
		window.innerWidth <= 400 ? 450 : window.innerWidth <= 600 ? 400 : 400;

	const margin = {
		top: window.innerWidth <= 400 ? 60 : window.innerWidth <= 600 ? 50 : 40,
		right:
			window.innerWidth <= 400 ? 20 : window.innerWidth <= 600 ? 25 : 30,
		bottom:
			window.innerWidth <= 400 ? 80 : window.innerWidth <= 600 ? 70 : 60,
		left:
			window.innerWidth <= 400 ? 70 : window.innerWidth <= 600 ? 65 : 80, // More space for larger numbers
	};

	// Clear previous chart
	d3.select(`#${divId}`).selectAll("*").remove();

	// Prepare data and find valid ranges
	let allDates = [];
	let allPrices = [];
	let validDataSets = [];

	dataSets.forEach((dataSet) => {
		const validPrices = dataSet.data.price.filter(
			(p) => !isNaN(p) && p > 0
		);
		if (validPrices.length > 0) {
			dataSet.parsedData = dataSet.data.timestamp
				.map((d, i) => ({
					date: new Date(d),
					price: dataSet.data.price[i],
				}))
				.filter((d) => !isNaN(d.price) && d.price > 0);

			if (dataSet.parsedData.length > 0) {
				validDataSets.push(dataSet);
				allDates = allDates.concat(
					dataSet.parsedData.map((d) => d.date)
				);
				allPrices = allPrices.concat(
					dataSet.parsedData.map((d) => d.price)
				);
			}
		}
	});

	if (validDataSets.length === 0) {
		console.error("No valid data to display in relative growth chart");
		return;
	}

	// Create SVG
	const svg = d3
		.select(`#${divId}`)
		.append("svg")
		.attr("width", internalWidth)
		.attr("height", internalHeight);

	// Scales - Use log scale for Y-axis to better show relative growth
	const x = d3
		.scaleTime()
		.domain(d3.extent(allDates))
		.range([margin.left, internalWidth - margin.right]);

	const maxPrice = d3.max(allPrices);
	const minPrice = d3.min(allPrices.filter((p) => p > 0));

	// Use log scale if the range is very large, otherwise linear
	const useLogScale = maxPrice / minPrice > 100;

	let y;
	if (useLogScale) {
		y = d3
			.scaleLog()
			.domain([Math.max(minPrice * 0.8, 0.1), maxPrice * 1.2])
			.range([internalHeight - margin.bottom, margin.top])
			.clamp(true);
	} else {
		y = d3
			.scaleLinear()
			.domain([0, maxPrice * 1.05])
			.range([internalHeight - margin.bottom, margin.top]);
	}

	// Grid lines
	const numXTicks =
		window.innerWidth <= 400 ? 3 : window.innerWidth <= 600 ? 4 : 6;
	const numYTicks =
		window.innerWidth <= 400 ? 4 : window.innerWidth <= 600 ? 5 : 6;

	// X-axis grid
	svg.append("g")
		.attr("class", "grid")
		.attr("transform", `translate(0,${internalHeight - margin.bottom})`)
		.call(
			d3
				.axisBottom(x)
				.ticks(numXTicks)
				.tickSize(-(internalHeight - margin.top - margin.bottom))
				.tickFormat("")
		);

	// Y-axis grid
	svg.append("g")
		.attr("class", "grid")
		.attr("transform", `translate(${margin.left},0)`)
		.call(
			d3
				.axisLeft(y)
				.ticks(numYTicks)
				.tickSize(-(internalWidth - margin.left - margin.right))
				.tickFormat("")
		);

	// X-axis
	const xAxis = svg
		.append("g")
		.attr("transform", `translate(0,${internalHeight - margin.bottom})`)
		.call(d3.axisBottom(x).ticks(numXTicks));

	if (window.innerWidth <= 600) {
		xAxis
			.selectAll("text")
			.attr("transform", "rotate(-45)")
			.style("text-anchor", "end");
	}

	// Y-axis with better formatting
	const yAxis = svg
		.append("g")
		.attr("transform", `translate(${margin.left},0)`)
		.call(
			d3
				.axisLeft(y)
				.ticks(numYTicks)
				.tickFormat((d) => {
					if (d >= 1000000) return `${(d / 1000000).toFixed(1)}M`;
					if (d >= 1000) return `${(d / 1000).toFixed(1)}K`;
					if (d >= 1) return `${d.toFixed(0)}x`;
					return d.toFixed(2);
				})
		);

	// Y-axis label
	svg.append("text")
		.attr("transform", "rotate(-90)")
		.attr(
			"y",
			window.innerWidth <= 400 ? 10 : window.innerWidth <= 600 ? 10 : 15
		)
		.attr("x", 0 - internalHeight / 2)
		.attr("dy", "-1em")
		.style("text-anchor", "middle")
		.text("Growth Multiplier");

	// Line generator
	const line = d3
		.line()
		.x((d) => x(d.date))
		.y((d) => y(d.price))
		.curve(d3.curveLinear)
		.defined((d) => !isNaN(d.price) && d.price > 0); // Only draw valid points

	// Draw each line
	validDataSets.forEach((dataSet) => {
		svg.append("path")
			.datum(dataSet.parsedData)
			.attr("class", `line ${dataSet.cssClass}`)
			.attr("fill", "none")
			.attr("stroke", dataSet.color)
			.attr("stroke-width", 2)
			.attr("d", line);
	});

	// Title
	svg.append("text")
		.attr("x", internalWidth / 2)
		.attr(
			"y",
			window.innerWidth <= 400 ? 30 : window.innerWidth <= 600 ? 25 : 20
		)
		.attr("text-anchor", "middle")
		.style("font-weight", "bold")
		.text("CRYPTO RELATIVE GROWTH IN USD");

	// Add Legend
	const legend = svg
		.append("g")
		.attr("class", "legend")
		.attr(
			"transform",
			`translate(${margin.left}, ${internalHeight - margin.bottom + 40})`
		);

	validDataSets.forEach((d, i) => {
		const legendRow = legend
			.append("g")
			.attr("transform", `translate(0, ${i * 20})`);

		legendRow
			.append("rect")
			.attr("width", 10)
			.attr("height", 10)
			.attr("fill", d.color);

		legendRow
			.append("text")
			.attr("x", 20)
			.attr("y", 10)
			.attr("text-anchor", "start")
			.style("font-size", "0.8em")
			.text(d.label);
	});

	// Add reference line at 1x
	svg.append("line")
		.attr("x1", margin.left)
		.attr("x2", internalWidth - margin.right)
		.attr("y1", y(1))
		.attr("y2", y(1))
		.attr("stroke", "#666")
		.attr("stroke-dasharray", "3,3")
		.attr("opacity", 0.5);

	// Add 1x label
	svg.append("text")
		.attr("x", margin.left + 5)
		.attr("y", y(1) - 5)
		.style("font-size", "0.7em")
		.style("fill", "#666")
		.text("1x");
}

// // Expose globally for use in main()
// window.drawCombinedChart = drawCombinedChart;
// window.drawDollarPurchasingPowerChart = drawDollarPurchasingPowerChart;
// window.drawRelativeGrowthChart = drawRelativeGrowthChart;

// Export object for easy access
const chart_drawing = {
	drawCombinedChart,
	drawDollarPurchasingPowerChart,
	drawRelativeGrowthChart,
	halvingDraw
};