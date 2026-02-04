// dong-overlay.js - 동 오버레이 및 줌

// 동 경계선 오버레이 추가 함수
function addDongOverlay(g, districtFeature, scale) {
    if (!dongGeoData) return;

    const districtName = districtFeature.properties.name;
    initDongDataForDistrict(districtName);

    const code = districtCodes[districtName];
    const dongFeatures = dongGeoData.features.filter(f =>
        f.properties.code && f.properties.code.startsWith(code)
    );

    if (dongFeatures.length === 0) return;

    // 기존 오버레이 제거
    g.selectAll('.dong-overlay-group').remove();

    // 오버레이 그룹 생성
    const dongGroup = g.append('g').attr('class', 'dong-overlay-group');

    // 1. 전체 화면 배경 (고급스러운 인디고)
    const container = document.getElementById('seoulMap');
    const viewWidth = container.clientWidth || 800;
    const viewHeight = Math.max(container.clientHeight, 500);

    // 현재 transform을 고려하여 화면 전체를 덮는 배경
    const bounds = mapPath.bounds(districtFeature);
    const cx = (bounds[0][0] + bounds[1][0]) / 2;
    const cy = (bounds[0][1] + bounds[1][1]) / 2;

    dongGroup.append('rect')
        .attr('class', 'dong-background')
        .attr('x', cx - (viewWidth / scale) * 5)
        .attr('y', cy - (viewHeight / scale) * 5)
        .attr('width', (viewWidth / scale) * 10)
        .attr('height', (viewHeight / scale) * 10)
        .attr('fill', 'rgba(15, 23, 42, 0.78)')
        .attr('pointer-events', 'none');

    // 2. 동마다 clipPath 생성 (구 경계선과 동일한 방식)
    const defs = d3.select('#seoulMap svg defs');
    dongFeatures.forEach((d, i) => {
        // 기존 clipPath 제거 후 재생성
        defs.select(`#clip-dong-${districtName}-${i}`).remove();
        defs.append('clipPath')
            .attr('id', `clip-dong-${districtName}-${i}`)
            .append('path')
            .attr('d', mapPath(d));
    });

    // 3. 동 배경 (동 영역 채움) - 두근 효과가 적용될 레이어
    dongGroup.selectAll('path.dong-fill')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', 'dong-fill')
        .attr('data-dong', d => d.properties.name)
        .attr('d', mapPath)
        .attr('fill', '#1a2744')
        .attr('stroke', 'none')
        .attr('pointer-events', 'none')
        .style('transform-origin', 'center')
        .style('transform-box', 'fill-box');

    // 구 평균 온도 가져오기 (동별 데이터가 없을 때 fallback)
    const districtApiData = apiDataCache.byDistrict ? apiDataCache.byDistrict[districtName] : null;
    const districtAvgTemp = districtApiData?.avgTemp;

    // 디버깅 로그
    console.log('🌡️ 동 오버레이 온도 데이터:', {
        districtName,
        districtAvgTemp,
        apiDataCache: apiDataCache.byDistrict ? Object.keys(apiDataCache.byDistrict) : 'empty',
        dongDataKeys: Object.keys(dongData).filter(k => k.startsWith(districtName))
    });

    // 동별 온도 가져오기 (없으면 구 평균 사용)
    function getDongTemp(dongName) {
        const key = `${districtName}_${dongName}`;
        const dongTemp = dongData[key]?.temp;
        if (dongTemp !== null && dongTemp !== undefined && !isNaN(dongTemp)) {
            return dongTemp;
        }
        // 동별 온도가 없으면 구 평균 온도 사용
        return districtAvgTemp;
    }

    // 온도 레벨에 따른 색상 및 glow 반환 함수
    function getTempColor(temp) {
        if (temp === null || temp === undefined || isNaN(temp)) return '#7f8c8d'; // neutral
        if (temp < 0) return '#3498db'; // cold
        if (temp < 10) return '#00d9ff'; // cool
        if (temp < 25) return '#2ecc71'; // good
        if (temp < 35) return '#f39c12'; // bad
        return '#e74c3c'; // danger
    }

    function getTempGlow(temp) {
        if (temp === null || temp === undefined || isNaN(temp)) return 'drop-shadow(0 0 1px rgba(127, 140, 141, 0.3))';
        if (temp < 0) return 'drop-shadow(0 0 2px rgba(52, 152, 219, 0.5))';
        if (temp < 10) return 'drop-shadow(0 0 2px rgba(0, 217, 255, 0.4))';
        if (temp < 25) return 'drop-shadow(0 0 2px rgba(46, 204, 113, 0.4))';
        if (temp < 35) return 'drop-shadow(0 0 3px rgba(243, 156, 18, 0.5))';
        return 'drop-shadow(0 0 4px rgba(231, 76, 60, 0.6))';
    }

    // 5. 동 경계선 (온도 기반 색상, clipPath로 내부에만 표시 - 구 경계선과 동일)
    dongGroup.selectAll('path.dong-overlay-border')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', d => {
            const temp = getDongTemp(d.properties.name);
            return `dong-overlay-border dong-stroke ${getTempLevel(temp)}`;
        })
        .attr('d', mapPath)
        .attr('data-dong', d => d.properties.name)
        .attr('fill', 'none')
        .attr('stroke', d => {
            const temp = getDongTemp(d.properties.name);
            return getTempColor(temp);
        })
        .attr('stroke-width', 2.5)
        .attr('clip-path', (d, i) => `url(#clip-dong-${districtName}-${i})`)
        .attr('pointer-events', 'none')
        .style('filter', d => {
            const temp = getDongTemp(d.properties.name);
            return getTempGlow(temp);
        })
        .attr('opacity', 0)
        .transition()
        .duration(400)
        .attr('opacity', 1);

    // 6. 동 분리선 (얇은 어두운 선 - 경계 구분용)
    dongGroup.selectAll('path.dong-border')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', 'dong-border')
        .attr('d', mapPath)
        .attr('fill', 'none')
        .attr('stroke', '#0d1525')
        .attr('stroke-width', 0.8)
        .attr('pointer-events', 'none')
        .attr('opacity', 0)
        .transition()
        .duration(400)
        .attr('opacity', 1);

    // 7. 센서 마커
    addSensorMarkersToOverlay(dongGroup, districtName, dongFeatures, scale);

    // 8. 풍향/풍속 애니메이션
    startWindAnimationForOverlay(dongGroup, districtFeature, scale, viewWidth, viewHeight);

    // 9. 동 호버 영역 (테두리, 센서, 풍향 위에 배치하여 효과가 보이도록)
    dongGroup.selectAll('path.dong-overlay-path')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', 'dong-overlay-path')
        .attr('d', mapPath)
        .attr('data-dong', d => d.properties.name)
        .attr('fill', 'transparent')
        .attr('stroke', 'none')
        .attr('cursor', 'pointer')
        .style('transform-origin', 'center')
        .style('transform-box', 'fill-box')
        .on('mouseenter', function(event, d) {
            // 동 줌인 상태에서는 hover 효과 무시
            if (currentView === 'dongZoom') return;

            // 해당 동의 dong-fill 요소에 두근 효과 적용
            const dongName = d.properties.name;
            const fillElement = dongGroup.select(`.dong-fill[data-dong="${dongName}"]`).node();
            if (fillElement) {
                triggerHoverPulse(fillElement);
            }
            showDongInfo(dongName);
        })
        .on('mouseleave', function(event, d) {
            // 동 줌인 상태에서는 hover 효과 무시
            if (currentView === 'dongZoom') return;

            // 해당 동의 dong-fill 요소 효과 리셋
            const dongName = d.properties.name;
            const fillElement = dongGroup.select(`.dong-fill[data-dong="${dongName}"]`).node();
            if (fillElement) {
                resetHoverPulse(fillElement);
            }
            showDistrictTotalInfo();
        })
        .on('click', function(event, d) {
            event.stopPropagation();
            // 동 줌인 상태에서 다른 동 클릭 시에도 이동 허용
            zoomIntoDongOverlay(d, scale);
        });

    // 10. 동 라벨 (가장 위에 표시)
    dongGroup.selectAll('text.dong-overlay-label')
        .data(dongFeatures)
        .enter()
        .append('text')
        .attr('class', 'dong-overlay-label')
        .attr('x', d => mapPath.centroid(d)[0])
        .attr('y', d => mapPath.centroid(d)[1])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', d => {
            const baseSize = calculateFontSize(d, mapPath, d.properties.name, 12, 24);
            return (baseSize / scale) + 'px';
        })
        .attr('font-weight', 'bold')
        .attr('pointer-events', 'none')
        .style('text-shadow', `0 0 ${3/scale}px #000, 0 0 ${6/scale}px #000`)
        .text(d => d.properties.name)
        .attr('opacity', 0)
        .transition()
        .duration(400)
        .delay(200)
        .attr('opacity', 1);

    // 예약된 동으로 자동 이동 (발원지 클릭 시)
    if (pendingDongNavigation) {
        const targetDongName = pendingDongNavigation;
        pendingDongNavigation = null; // 초기화

        console.log('📍 동 자동 이동 예약됨:', targetDongName);
        console.log('📍 현재 구의 동 목록:', dongFeatures.map(f => f.properties.name));

        // 동 오버레이 로딩 완료 후 해당 동으로 이동
        setTimeout(() => {
            // 동 이름으로 feature 찾기 (다양한 매칭 방식 지원)
            const normalizedTarget = targetDongName.replace(/[0-9·\s-]/g, '');

            const targetDongFeature = dongFeatures.find(f => {
                const fName = f.properties.name;
                const normalizedFName = fName.replace(/[0-9·\s-]/g, '');

                // 정확한 매칭
                if (fName === targetDongName) return true;
                // 포함 매칭
                if (fName.includes(targetDongName) || targetDongName.includes(fName)) return true;
                // 정규화된 이름 매칭
                if (normalizedFName === normalizedTarget) return true;
                if (normalizedFName.includes(normalizedTarget) || normalizedTarget.includes(normalizedFName)) return true;

                return false;
            });

            if (targetDongFeature) {
                console.log('🎯 동으로 자동 이동:', targetDongName, '→', targetDongFeature.properties.name);
                zoomIntoDongOverlay(targetDongFeature, scale);
            } else {
                console.log('⚠ 동을 찾을 수 없음:', targetDongName);
                // 매칭 실패 시 첫 번째 동으로 이동 (fallback)
                if (dongFeatures.length > 0) {
                    console.log('🔄 첫 번째 동으로 대체 이동:', dongFeatures[0].properties.name);
                    zoomIntoDongOverlay(dongFeatures[0], scale);
                }
            }
        }, 800); // 동 오버레이 애니메이션 완료 후
    }
}

// 오버레이에 센서 마커 추가
function addSensorMarkersToOverlay(dongGroup, districtName, dongFeatures, scale) {
    if (!sensorData || !sensorData[districtName]) return;

    const districtSensors = sensorData[districtName];
    const allSensors = [];

    // 동 이름으로 feature를 찾는 헬퍼 함수
    function findDongFeature(dongName) {
        // 정확한 매칭 시도
        let feature = dongFeatures.find(f => f.properties.name === dongName);
        if (feature) return feature;

        // 부분 매칭 시도 (센서 데이터의 동 이름이 다를 수 있음)
        feature = dongFeatures.find(f =>
            f.properties.name.includes(dongName.split('-')[0]) ||
            dongName.includes(f.properties.name)
        );
        return feature;
    }

    // 점이 동 영역 내에 있는지 확인
    function isPointInDong(lng, lat, dongFeature) {
        if (!dongFeature || !dongFeature.geometry) return false;
        return d3.geoContains(dongFeature, [lng, lat]);
    }

    // 동 영역 내 랜덤 위치 생성
    function getRandomPointInDong(dongFeature) {
        if (!dongFeature) return null;
        const bounds = mapPath.bounds(dongFeature);
        const centroid = mapPath.centroid(dongFeature);

        // 중심점에서 약간 랜덤하게 offset
        const offsetX = (Math.random() - 0.5) * (bounds[1][0] - bounds[0][0]) * 0.5;
        const offsetY = (Math.random() - 0.5) * (bounds[1][1] - bounds[0][1]) * 0.5;

        return {
            px: centroid[0] + offsetX,
            py: centroid[1] + offsetY
        };
    }

    // 구 전체 경계 체크 함수
    function isPointInDistrict(lng, lat) {
        return dongFeatures.some(f => d3.geoContains(f, [lng, lat]));
    }

    // 구 전체 경계 박스 계산
    let districtBounds = null;
    dongFeatures.forEach(f => {
        const b = mapPath.bounds(f);
        if (!districtBounds) {
            districtBounds = [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
        } else {
            districtBounds[0][0] = Math.min(districtBounds[0][0], b[0][0]);
            districtBounds[0][1] = Math.min(districtBounds[0][1], b[0][1]);
            districtBounds[1][0] = Math.max(districtBounds[1][0], b[1][0]);
            districtBounds[1][1] = Math.max(districtBounds[1][1], b[1][1]);
        }
    });

    // 모든 동의 센서를 모아서 배열로 만들기
    Object.keys(districtSensors).forEach(dongNameFromData => {
        const dongFeature = findDongFeature(dongNameFromData);
        // dongFeature가 없으면 첫 번째 동 사용
        const targetDong = dongFeature || dongFeatures[0];

        districtSensors[dongNameFromData].forEach(sensor => {
            const coords = [sensor.lng, sensor.lat];
            let projected = mapProjection(coords);
            if (!projected) return; // 투영 실패 시 스킵
            let px = projected[0];
            let py = projected[1];

            // 센서가 구 경계 내에 있는지 확인 (좌표 + 투영 위치 둘 다 체크)
            const isInsideGeo = isPointInDistrict(sensor.lng, sensor.lat);
            const isInsideBounds = districtBounds &&
                px >= districtBounds[0][0] && px <= districtBounds[1][0] &&
                py >= districtBounds[0][1] && py <= districtBounds[1][1];

            if (!isInsideGeo || !isInsideBounds) {
                // 경계 밖이면 해당 동의 중심 근처로 배치
                const centroid = mapPath.centroid(targetDong);
                const bounds = mapPath.bounds(targetDong);
                const offsetX = (Math.random() - 0.5) * (bounds[1][0] - bounds[0][0]) * 0.4;
                const offsetY = (Math.random() - 0.5) * (bounds[1][1] - bounds[0][1]) * 0.4;
                px = centroid[0] + offsetX;
                py = centroid[1] + offsetY;
            }

            allSensors.push({
                ...sensor,
                dong: dongNameFromData,
                px: px,
                py: py
            });
        });
    });

    if (allSensors.length === 0) return;

    // 센서 마커 그룹
    const markerGroup = dongGroup.append('g').attr('class', 'sensor-overlay-group');

    // 역추적선 그룹 생성
    let traceGroup = dongGroup.select('.traceback-group');
    if (traceGroup.empty()) {
        traceGroup = dongGroup.append('g').attr('class', 'traceback-group');
    }

    const sensorMarkers = markerGroup.selectAll('circle.sensor-overlay-marker')
        .data(allSensors)
        .enter()
        .append('circle')
        .attr('class', d => `sensor-overlay-marker sensor-marker-${getSensorStatus(d.id)} model-${getSensorModelType(d.id)}`)
        .attr('cx', d => d.px)
        .attr('cy', d => d.py)
        .attr('r', 5 / scale)
        .attr('fill', d => {
            const status = getSensorStatus(d.id);
            if (status === 'danger') return '#e17055';
            if (status === 'warning') return '#fdcb6e';
            return '#00b894';
        })
        .attr('stroke', d => getSensorModelType(d.id) === 'o' ? '#00d9ff' : '#fff')
        .attr('stroke-width', 1.5 / scale)
        .attr('opacity', 0)
        .style('cursor', d => getSensorStatus(d.id) !== 'normal' ? 'pointer' : 'default');

    // 이벤트 핸들러 별도 등록
    sensorMarkers
        .on('mouseenter', function(event, d) {
            showSensorTooltip(event, d);
        })
        .on('mouseleave', hideSensorTooltip)
        .on('click', function(event, d) {
            event.stopPropagation();
            console.log('🖱️ 센서 클릭됨:', d.id);
            const status = getSensorStatus(d.id);
            console.log('  - 센서 상태:', status);
            // warning 또는 danger 상태의 센서만 역추적
            if (status === 'warning' || status === 'danger') {
                // 현재 뷰에 맞는 스케일 사용 (dongZoom일 때는 currentDongScale)
                const currentScale = currentView === 'dongZoom' ? currentDongScale :
                                    (currentView === 'dong' ? currentDistrictScale : scale);
                handleSensorClick(d, mapProjection, traceGroup, currentScale);
            } else {
                console.log('  - 정상 상태 센서 - 역추적 미실행');
            }
        });

    // 페이드인 애니메이션
    sensorMarkers.transition()
        .duration(400)
        .delay((d, i) => 300 + i * 5)
        .attr('opacity', 1);
}

// 동 줌인 (오버레이 상태에서)
function zoomIntoDongOverlay(dongFeature, currentScale) {
    selectedDong = dongFeature.properties.name;

    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group');
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    const bounds = mapPath.bounds(dongFeature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    // 동 줌인 시 더 크게 확대
    const scale = Math.min(80, 0.92 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // 이미 dongZoom 상태면 먼저 모든 동 투명도 리셋
    if (currentView === 'dongZoom') {
        g.selectAll('.dong-overlay-path').attr('fill', 'transparent');
        g.selectAll('.dong-overlay-border, .dong-border').attr('opacity', 1);
        g.selectAll('.dong-overlay-label').attr('opacity', 1);
    }

    // 다른 동 페이드아웃
    g.selectAll('.dong-overlay-path')
        .filter(d => d !== dongFeature)
        .transition()
        .duration(300)
        .attr('fill', 'rgba(0, 0, 0, 0.5)');

    g.selectAll('.dong-overlay-border')
        .transition()
        .duration(300)
        .attr('opacity', 0.3);

    g.selectAll('.dong-overlay-label')
        .filter(d => d !== dongFeature)
        .transition()
        .duration(300)
        .attr('opacity', 0);

    // 선택된 동 라벨 크기 조정
    g.selectAll('.dong-overlay-label')
        .filter(d => d === dongFeature)
        .transition()
        .duration(500)
        .attr('font-size', `${35 / scale}px`)
        .attr('opacity', 1);

    // 센서 마커 크기 조정
    g.selectAll('.sensor-overlay-marker')
        .transition()
        .duration(500)
        .attr('r', 5 / scale)
        .attr('stroke-width', 1 / scale);

    // 줌인 애니메이션
    g.transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${scale})`)
        .on('end', () => {
            currentView = 'dongZoom';
            currentDongScale = scale;

            // d3.zoom 상태 동기화 (휠 줌 튕김 방지)
            if (currentZoom) {
                const newTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                svg.call(currentZoom.transform, newTransform);
            }

            showDongInfo(selectedDong);

            // 동 진입 연출 표시
            const subtitle = pendingLocationSubtitle || '서울특별시';
            pendingLocationSubtitle = null; // 사용 후 초기화
            showLocationAnnounce(selectedDistrict, selectedDong, subtitle);
        });
}

// 줌아웃
function zoomOut() {
    if (currentView === 'city') return;

    // 동 줌인 상태에서는 구 레벨로 돌아감
    if (currentView === 'dongZoom') {
        zoomOutToDong();
        return;
    }

    // 구 레벨(dong)에서는 서울시 전체로 돌아감
    document.getElementById('backButton').classList.remove('visible');

    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group');

    // 동 오버레이 페이드아웃 후 제거
    g.selectAll('.dong-overlay-group')
        .transition()
        .duration(300)
        .attr('opacity', 0)
        .on('end', function() {
            d3.select(this).remove();
        });

    // 다른 구들 페이드인
    g.selectAll('.district-path')
        .transition()
        .duration(600)
        .attr('opacity', 1);

    g.selectAll('.district-stroke')
        .transition()
        .duration(600)
        .attr('opacity', 1);

    g.selectAll('.district-label')
        .transition()
        .duration(600)
        .attr('opacity', 1);

    // 줌아웃 애니메이션
    g.transition()
        .duration(750)
        .ease(d3.easeCubicInOut)
        .attr('transform', 'translate(0,0) scale(1)')
        .on('end', () => {
            currentView = 'city';
            selectedDistrict = null;
            selectedDong = null;

            // d3.zoom 상태 동기화
            if (currentZoom) {
                svg.call(currentZoom.transform, d3.zoomIdentity);
            }

            // 풍향/풍속 애니메이션 다시 시작
            const width = container.clientWidth || 800;
            const height = Math.max(container.clientHeight, 500);
            startWindAnimationForCity(g, width, height);

            // 서울시 전체 데이터 표시
            showSeoulTotalInfo();

            // 센서 토글 패널 다시 보이기
            const sensorPanel = document.getElementById('sensorTogglePanel');
            if (sensorPanel) sensorPanel.style.display = 'flex';

            // 활성화된 센서 레이어 다시 그리기
            redrawActiveSensorLayers();
        });
}

// 동 줌인 상태에서 구 레벨로 돌아가기
function zoomOutToDong() {
    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group');
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    // 선택된 구의 줌 스케일 계산
    const districtFeature = geoData.features.find(f => f.properties.name === selectedDistrict);
    if (!districtFeature) return;

    const bounds = mapPath.bounds(districtFeature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    // 화면에 꽉 차도록 확대 비율 (zoomIntoDistrict와 동일)
    const scale = Math.min(35, 0.92 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // 모든 동 오버레이 다시 보이게
    g.selectAll('.dong-overlay-path')
        .transition()
        .duration(400)
        .attr('fill', 'transparent');

    g.selectAll('.dong-overlay-border')
        .transition()
        .duration(400)
        .attr('opacity', 1);

    g.selectAll('.dong-overlay-label')
        .transition()
        .duration(400)
        .attr('opacity', 1)
        .attr('font-size', function(d) {
            // 확대된 스케일에 맞게 폰트 크기 조정
            const baseSize = calculateFontSize(d, mapPath, d.properties.name, 15, 28);
            return (baseSize / scale) + 'px';
        });

    // 센서 마커 크기 복구
    g.selectAll('.sensor-overlay-marker')
        .transition()
        .duration(400)
        .attr('r', 5 / scale)
        .attr('stroke-width', 1 / scale);

    // 줌 리셋 (구 레벨로)
    g.transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${scale})`)
        .on('end', () => {
            // 상태 업데이트
            currentView = 'dong';
            selectedDong = null;
            currentDistrictScale = scale;

            // d3.zoom 상태 동기화 (휠 줌 튕김 방지)
            if (currentZoom) {
                const newTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                svg.call(currentZoom.transform, newTransform);
            }

            // 구 평균 데이터 표시
            showDistrictTotalInfo();
        });
}
