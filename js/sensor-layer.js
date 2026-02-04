// sensor-layer.js - 센서 레이어 토글

// 센서 레이어 토글
function toggleSensorLayer(type) {
    sensorLayerState[type] = !sensorLayerState[type];
    const toggle = document.getElementById('toggle' + type.charAt(0).toUpperCase() + type.slice(1));

    if (sensorLayerState[type]) {
        if (toggle) toggle.classList.add('active');
        drawSensorLayer(type);
    } else {
        if (toggle) toggle.classList.remove('active');
        removeSensorLayer(type);
    }
}

// 센서 레이어 그리기
function drawSensorLayer(type) {
    const svg = d3.select('#seoulMap svg');
    const g = svg.select('.map-group');
    if (g.empty()) return;

    // 기존 레이어 제거
    g.selectAll(`.station-layer-${type}`).remove();

    // 라벨 뒤에 삽입 (라벨이 센서 점 위에 표시되도록)
    const firstLabel = g.select('.district-label');
    let layerGroup;
    if (!firstLabel.empty()) {
        layerGroup = g.insert('g', '.district-label').attr('class', `station-layer-${type}`);
    } else {
        layerGroup = g.append('g').attr('class', `station-layer-${type}`);
    }

    let stations = [];
    let markerClass = '';
    let markerSize = 4;
    let markerColor = '';

    if (type === 'sdot') {
        // S-DoT 센서 - sensorData에서 모든 센서 추출 (구 > 동 > 센서 구조)
        Object.values(sensorData).forEach(districtDongs => {
            Object.values(districtDongs).forEach(dongSensors => {
                dongSensors.forEach(sensor => {
                    stations.push({
                        id: sensor.id,
                        name: sensor.id,
                        lat: sensor.lat,
                        lng: sensor.lng
                    });
                });
            });
        });
        markerClass = 'sdot';
        markerSize = 3;
        markerColor = '#2ecc71';
    } else if (type === 'asos') {
        stations = asosStations;
        markerClass = 'asos';
        markerSize = 6;
        markerColor = '#e74c3c';
    } else if (type === 'aws') {
        stations = awsStations;
        markerClass = 'aws';
        markerSize = 5;
        markerColor = '#9b59b6';
    }

    // 현재 지도 투영 사용
    if (!mapProjection) return;

    stations.forEach(station => {
        const coords = mapProjection([station.lng, station.lat]);
        if (coords) {
            layerGroup.append('circle')
                .attr('class', `station-marker-${markerClass}`)
                .attr('cx', coords[0])
                .attr('cy', coords[1])
                .attr('r', markerSize)
                .attr('fill', markerColor)
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 1)
                .attr('opacity', 0)
                .style('pointer-events', 'none')
                .transition()
                .duration(300)
                .attr('opacity', 0.9);
        }
    });
}

// 센서 레이어 제거
function removeSensorLayer(type) {
    const svg = d3.select('#seoulMap svg');
    const g = svg.select('.map-group');
    if (!g.empty()) {
        g.selectAll(`.station-layer-${type}`).remove();
    }
}

// 전체 지도 복귀 시 센서 레이어 다시 그리기
function redrawActiveSensorLayers() {
    Object.keys(sensorLayerState).forEach(type => {
        if (sensorLayerState[type]) {
            drawSensorLayer(type);
        }
    });
}
