// map.js - D3 지도 렌더링

// 지도 색상 업데이트 (API 데이터 기반 - 온도 기준)
function updateMapColorsFromApi() {
    if (currentView === 'city') {
        d3.selectAll('.district-stroke').each(function() {
            const el = d3.select(this);
            const name = el.attr('data-district');
            const apiData = apiDataCache.byDistrict[name];

            // 온도 기반 색상 (데이터 없으면 회색)
            let level = 'level-unknown';
            if (apiData && apiData.avgTemp !== null && !isNaN(apiData.avgTemp)) {
                const temp = apiData.avgTemp;
                if (temp < 0) level = 'level-cold';
                else if (temp < 10) level = 'level-cool';
                else if (temp < 25) level = 'level-good';
                else if (temp < 35) level = 'level-bad';
                else level = 'level-danger';
            }
            el.attr('class', `district-stroke ${level}`);
        });
    } else if (selectedDistrict) {
        // 구 평균 온도 가져오기 (동별 데이터가 없을 때 fallback)
        const districtApiData = apiDataCache.byDistrict ? apiDataCache.byDistrict[selectedDistrict] : null;
        const districtAvgTemp = districtApiData?.avgTemp;

        d3.selectAll('.dong-stroke').each(function() {
            const el = d3.select(this);
            const dongName = el.attr('data-dong');
            const key = `${selectedDistrict}_${dongName}`;
            const data = dongData[key];

            // 동별 온도가 없으면 구 평균 사용
            let temp = (data && data.temp !== null) ? data.temp : districtAvgTemp;

            let level = 'level-unknown';
            let strokeColor = '#7f8c8d';
            let glowFilter = 'drop-shadow(0 0 2px rgba(127, 140, 141, 0.5))';

            if (temp !== null && temp !== undefined && !isNaN(temp)) {
                if (temp < 0) {
                    level = 'level-cold';
                    strokeColor = '#3498db';
                    glowFilter = 'drop-shadow(0 0 3px rgba(52, 152, 219, 0.8))';
                } else if (temp < 10) {
                    level = 'level-cool';
                    strokeColor = '#00d9ff';
                    glowFilter = 'drop-shadow(0 0 3px rgba(0, 217, 255, 0.6))';
                } else if (temp < 25) {
                    level = 'level-good';
                    strokeColor = '#2ecc71';
                    glowFilter = 'drop-shadow(0 0 3px rgba(46, 204, 113, 0.6))';
                } else if (temp < 35) {
                    level = 'level-bad';
                    strokeColor = '#f39c12';
                    glowFilter = 'drop-shadow(0 0 5px rgba(243, 156, 18, 0.7))';
                } else {
                    level = 'level-danger';
                    strokeColor = '#e74c3c';
                    glowFilter = 'drop-shadow(0 0 6px rgba(231, 76, 60, 0.8))';
                }
            }

            // dong-overlay-border 클래스 보존
            const isOverlay = el.classed('dong-overlay-border');
            el.attr('class', `dong-stroke ${level}${isOverlay ? ' dong-overlay-border' : ''}`);

            // 직접 stroke 색상과 glow 효과 적용
            el.attr('stroke', strokeColor);
            el.style('filter', glowFilter);
        });
    }

    // 센서 마커 색상도 업데이트
    updateSensorMarkers();
}

// 지도 렌더링
function renderMap() {
    if (!geoData || !geoData.features) {
        console.error('GeoJSON 데이터가 없습니다');
        document.getElementById('seoulMap').innerHTML = '<div class="loading"><span>지도 데이터 로드 실패</span></div>';
        return;
    }

    const container = document.getElementById('seoulMap');
    container.innerHTML = '';

    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    mapSvg = d3.select('#seoulMap')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // clipPath 정의를 위한 defs 생성
    const defs = mapSvg.append('defs');

    const g = mapSvg.append('g').attr('class', 'map-group');

    mapProjection = d3.geoMercator()
        .center([126.985, 37.56])
        .scale(Math.min(width, height) * 155)
        .translate([width / 2, height / 2]);

    mapPath = d3.geoPath().projection(mapProjection);

    // 각 구마다 clipPath 생성
    geoData.features.forEach((d, i) => {
        defs.append('clipPath')
            .attr('id', `clip-district-${i}`)
            .append('path')
            .attr('d', mapPath(d));
    });

    // 1. 먼저 fill 레이어 (배경)
    g.selectAll('path.district-path')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', 'district-path')
        .attr('d', mapPath)
        .attr('data-district', d => d.properties.name)
        .on('mouseenter', function(event, d) { handleDistrictHover(event, d); })
        .on('mouseleave', function(event, d) { handleDistrictLeave(event, d); })
        .on('click', handleDistrictClick);

    // 2. stroke 레이어 (clipPath로 내부에만 테두리 표시)
    g.selectAll('path.district-stroke')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', d => {
            const apiData = apiDataCache.byDistrict[d.properties.name];
            const temp = apiData?.avgTemp;
            return `district-stroke ${getTempLevel(temp)}`;
        })
        .attr('d', mapPath)
        .attr('data-district', d => d.properties.name)
        .attr('clip-path', (d, i) => `url(#clip-district-${i})`);

    // 3. 구분선 레이어 (지역 경계를 검정색으로 구분)
    g.selectAll('path.district-border')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', 'district-border')
        .attr('d', mapPath)
        .attr('fill', 'none')
        .attr('stroke', '#0a0f1a')
        .attr('stroke-width', 1.5)
        .attr('pointer-events', 'none');

    // 4. 라벨 (지역 크기에 맞게 폰트 크기 조절)
    // 특정 구 라벨 위치 보정값
    const labelOffsets = {
        "종로구": { x: 0, y: 25 },
        "성북구": { x: 0, y: 15 },
        "강북구": { x: -10, y: 0 },
        "노원구": { x: 0, y: 12 },
        "서대문구": { x: -10, y: 0 },
        "양천구": { x: 0, y: 10 },
        "구로구": { x: -10, y: 0 },
        "강남구": { x: -15, y: 0 }
    };

    g.selectAll('text.district-label')
        .data(geoData.features)
        .enter()
        .append('text')
        .attr('class', 'district-label')
        .attr('x', d => mapPath.centroid(d)[0] + (labelOffsets[d.properties.name]?.x || 0))
        .attr('y', d => mapPath.centroid(d)[1] + (labelOffsets[d.properties.name]?.y || 0))
        .attr('font-size', d => calculateFontSize(d, mapPath, d.properties.name, 8, 13) + 'px')
        .text(d => d.properties.name);

    currentZoom = d3.zoom()
        .scaleExtent([1, 100])
        .on('zoom', (event) => g.attr('transform', event.transform));

    mapSvg.call(currentZoom);
    mapSvg.on('dblclick.zoom', null);

    // 서울시 전체 지도에도 풍향/풍속 애니메이션 추가
    startWindAnimationForCity(g, width, height);

    currentView = 'city';

    // 서울시 전체 데이터 표시
    showSeoulTotalInfo();
}
