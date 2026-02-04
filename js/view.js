// view.js - 뷰 전환 및 줌 제어

// 서울시 전체 평균 데이터 계산
function getSeoulTotalData() {
    const districts = Object.values(apiDataCache.byDistrict);
    if (districts.length === 0) return null;

    let tempSum = 0, humSum = 0, noiseSum = 0;
    let tempCnt = 0, humCnt = 0, noiseCnt = 0;

    districts.forEach(d => {
        if (d.avgTemp !== null && !isNaN(d.avgTemp)) { tempSum += d.avgTemp; tempCnt++; }
        if (d.avgHum !== null && !isNaN(d.avgHum)) { humSum += d.avgHum; humCnt++; }
        if (d.avgNoise !== null && !isNaN(d.avgNoise)) { noiseSum += d.avgNoise; noiseCnt++; }
    });

    return {
        avgTemp: tempCnt > 0 ? tempSum / tempCnt : null,
        avgHum: humCnt > 0 ? humSum / humCnt : null,
        avgNoise: noiseCnt > 0 ? noiseSum / noiseCnt : null,
        sensorCount: Object.keys(apiDataCache.bySensor).length
    };
}

// 서울시 전체 데이터 표시
function showSeoulTotalInfo() {
    const seoulData = getSeoulTotalData();
    updateInfoBox('서울시 전체', null, seoulData);
}

// 동 평균 데이터 표시
function showDongInfo(dongName) {
    let apiDongData = null;

    // 동 이름에서 숫자 제거하여 기본 이름 추출
    const baseDongName = dongName.replace(/[0-9·\s]/g, '');

    // sensorData에서 해당 동의 센서 ID 찾기
    let matchedSensorIds = [];
    if (sensorData && sensorData[selectedDistrict]) {
        const districtSensors = sensorData[selectedDistrict];
        Object.keys(districtSensors).forEach(sensorDongName => {
            const baseSensorDongName = sensorDongName.replace(/[0-9·\s-]/g, '');
            if (baseDongName === baseSensorDongName ||
                baseDongName.includes(baseSensorDongName) ||
                baseSensorDongName.includes(baseDongName)) {
                districtSensors[sensorDongName].forEach(sensor => {
                    matchedSensorIds.push(sensor.id);
                });
            }
        });
    }

    // 매칭된 센서들의 데이터 수집
    if (matchedSensorIds.length > 0 && apiDataCache.bySensor) {
        let tempSum = 0, humSum = 0, noiseSum = 0;
        let tempCnt = 0, humCnt = 0, noiseCnt = 0;

        matchedSensorIds.forEach(sensorId => {
            const sensorInfo = apiDataCache.bySensor[sensorId];
            if (sensorInfo && sensorInfo.measurements) {
                const m = sensorInfo.measurements;
                if (m.temp !== null && !isNaN(m.temp)) { tempSum += m.temp; tempCnt++; }
                if (m.humidity !== null && !isNaN(m.humidity)) { humSum += m.humidity; humCnt++; }
                if (m.noise !== null && !isNaN(m.noise)) { noiseSum += m.noise; noiseCnt++; }
            }
        });

        apiDongData = {
            avgTemp: tempCnt > 0 ? tempSum / tempCnt : null,
            avgHum: humCnt > 0 ? humSum / humCnt : null,
            avgNoise: noiseCnt > 0 ? noiseSum / noiseCnt : null,
            sensorCount: matchedSensorIds.length
        };
    }

    updateInfoBox(`${selectedDistrict} ${dongName}`, null, apiDongData);
}

// 동으로 줌인 애니메이션
function zoomIntoDong(element, feature) {
    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.dong-group');
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    // 현재 동 지도의 projection 가져오기
    const districtFeature = geoData.features.find(f => f.properties.name === selectedDistrict);
    if (!districtFeature) return;

    const padding = 30;
    const dongProjection = d3.geoMercator()
        .fitExtent([[padding, padding], [width - padding, height - padding]], districtFeature);
    const dongPath = d3.geoPath().projection(dongProjection);

    const bounds = dongPath.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = Math.min(6, 0.7 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // 이미 dongZoom 상태면 먼저 모든 동 투명도 리셋
    if (currentView === 'dongZoom') {
        g.selectAll('.dong-path').attr('opacity', 1);
        g.selectAll('.dong-stroke').attr('opacity', 1);
        g.selectAll('.dong-label').attr('opacity', 1);
    }

    // 다른 동들 페이드아웃
    g.selectAll('.dong-path')
        .filter(dd => dd !== feature)
        .transition()
        .duration(400)
        .attr('opacity', 0.2);

    g.selectAll('.dong-stroke')
        .filter(function() {
            return d3.select(this).attr('data-dong') !== feature.properties.name;
        })
        .transition()
        .duration(400)
        .attr('opacity', 0.2);

    g.selectAll('.dong-label')
        .filter(dd => dd !== feature)
        .transition()
        .duration(300)
        .attr('opacity', 0);

    // 선택된 동 라벨 강조 (폰트 크기 조정 - 줌인 시 작아지므로 보정)
    g.selectAll('.dong-label')
        .filter(dd => dd === feature)
        .transition()
        .duration(500)
        .attr('opacity', 1)
        .attr('font-size', `${14 / scale}px`)
        .attr('font-weight', 'bold');

    // 선택된 동 강조
    d3.select(element)
        .transition()
        .duration(600)
        .attr('opacity', 1);

    // 줌인 애니메이션
    g.transition()
        .duration(750)
        .ease(d3.easeCubicInOut)
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${scale})`)
        .on('end', () => {
            // 동 진입 연출 표시
            const dongName = feature.properties.name;
            showLocationAnnounce(selectedDistrict, dongName, '서울특별시');
        });

    // 상태 업데이트
    currentView = 'dongZoom';

    // 뒤로가기 버튼 텍스트 변경
    const backBtn = document.getElementById('backButton');
    backBtn.innerHTML = '<span>←</span> ' + selectedDistrict + ' 전체보기';

    // 해당 동의 평균 데이터 표시
    showDongInfo(feature.properties.name);
}

// 줌인 애니메이션 (zoomIntoDong과 동일한 방식)
function zoomIntoDistrict(element, feature) {
    // 센서 토글 패널 숨기기
    try {
        const sensorPanel = document.getElementById('sensorTogglePanel');
        if (sensorPanel) sensorPanel.style.display = 'none';

        // 기존 센서 레이어 제거
        Object.keys(sensorLayerState).forEach(type => {
            removeSensorLayer(type);
        });
    } catch (e) {
        console.error('센서 레이어 제거 오류:', e);
    }

    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group');
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    const bounds = mapPath.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    // 화면에 꽉 차도록 확대 비율 증가
    const scale = Math.min(35, 0.92 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // 현재 줌 스케일 저장 (나중에 동 오버레이에서 사용)
    currentDistrictScale = scale;

    // 다른 구들 페이드아웃
    g.selectAll('.district-path')
        .filter(dd => dd !== feature)
        .transition()
        .duration(400)
        .attr('opacity', 0);

    // 모든 구 테두리 숨기기 (오버레이에서 새로 그림)
    g.selectAll('.district-stroke')
        .transition()
        .duration(400)
        .attr('opacity', 0);

    // 다른 구 라벨 숨기기
    g.selectAll('.district-label')
        .filter(dd => dd !== feature)
        .transition()
        .duration(300)
        .attr('opacity', 0);

    // 선택된 구 라벨 페이드아웃 (동 오버레이에서 동 라벨로 대체)
    g.selectAll('.district-label')
        .filter(dd => dd === feature)
        .transition()
        .duration(400)
        .attr('opacity', 0);

    // 선택된 구도 페이드아웃 (동 오버레이에서 완전히 대체)
    d3.select(element)
        .classed('selected', true)
        .transition()
        .duration(600)
        .attr('opacity', 0);

    // 줌인 애니메이션
    g.transition()
        .duration(750)
        .ease(d3.easeCubicInOut)
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${scale})`)
        .on('end', () => {
            currentView = 'dong';
            document.getElementById('backButton').classList.add('visible');

            // d3.zoom 상태 동기화 (휠 줌 튕김 방지)
            if (currentZoom) {
                const newTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                svg.call(currentZoom.transform, newTransform);
            }

            // 동 경계선 오버레이 추가
            addDongOverlay(g, feature, scale);

            // 해당 구의 평균 데이터 표시
            showDistrictTotalInfo();

            // 지역 진입 연출 표시 (동 자동 이동 예약 시에는 건너뜀)
            if (!pendingDongNavigation) {
                const districtName = feature.properties.name;
                const subtitle = pendingLocationSubtitle || '서울특별시';
                pendingLocationSubtitle = null; // 사용 후 초기화
                showLocationAnnounce(districtName, null, subtitle);
            }
        });
}
