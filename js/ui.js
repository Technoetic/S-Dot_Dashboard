// ui.js - UI 인터랙션

// 호버 펄스 애니메이션 상태 관리
const hoverPulseState = new WeakMap();

// 호버 펄스 트리거 (한 번만 실행)
function triggerHoverPulse(element) {
    if (!element) return;

    // 이미 애니메이션 중이면 무시
    if (hoverPulseState.get(element)) return;

    // 애니메이션 실행 중 플래그 설정
    hoverPulseState.set(element, true);

    // 클래스 추가로 애니메이션 트리거
    element.classList.add('hover-pulse-active');

    // 애니메이션 종료 후 클래스 제거 (애니메이션 시간과 동일하게 설정)
    setTimeout(() => {
        element.classList.remove('hover-pulse-active');
    }, 700); // 0.7s 애니메이션 시간과 일치
}

// 호버 이벤트 종료 시 상태 리셋
function resetHoverPulse(element) {
    if (!element) return;
    hoverPulseState.set(element, false);
    element.classList.remove('hover-pulse-active');
}

// 호버 이벤트 (실시간 API 데이터 표시)
function handleDistrictHover(event, d) {
    // 구/동 지도에 들어가 있을 때는 hover 이벤트 무시
    if (currentView !== 'city') {
        return;
    }

    // 두근! 효과 - 한 번만 실행
    triggerHoverPulse(event.target);

    const name = d.properties.name;

    // API 데이터에서 실시간 정보 가져오기
    const apiDistrictData = apiDataCache.byDistrict[name];
    updateInfoBox(name, null, apiDistrictData);
}

// 마우스가 구역을 벗어났을 때 서울시 전체 데이터 표시
function handleDistrictLeave(event, d) {
    // 호버 상태 리셋
    resetHoverPulse(event.target);

    if (currentView === 'city') {
        showSeoulTotalInfo();
    }
}

// 선택된 구의 평균 데이터 표시
function showDistrictTotalInfo() {
    if (!selectedDistrict) return;
    const districtData = apiDataCache.byDistrict[selectedDistrict];
    updateInfoBox(selectedDistrict, null, districtData);
}

// 마우스가 동을 벗어났을 때
function handleDongLeave() {
    if (currentView === 'dong' && selectedDistrict) {
        // 구 레벨에서는 구 전체 데이터 표시
        showDistrictTotalInfo();
    } else if (currentView === 'dongZoom' && selectedDong) {
        // 동 줌인 상태에서는 선택된 동 데이터 유지
        showDongInfo(selectedDong);
    }
}

function handleDongHover(event, d) {
    // 동 줌인 상태에서는 hover 이벤트 무시 (선택된 동만 표시)
    if (currentView === 'dongZoom') {
        return;
    }

    const dongName = d.properties.name;

    // API 데이터에서 해당 동의 센서 정보 집계
    let apiDongData = null;
    if (apiDataCache.bySensor) {
        const dongSensors = Object.values(apiDataCache.bySensor).filter(s => {
            if (!s.dong || !s.district) return false;
            if (s.district !== selectedDistrict) return false;
            // 동 이름 매칭 (API 동 이름과 GeoJSON 동 이름)
            const apiDong = s.dong.replace(/\d+\([^)]+\)-dong/, '').replace(/-dong$/, '');
            return dongName.includes(apiDong) || apiDong.includes(dongName);
        });

        if (dongSensors.length > 0) {
            let tempSum = 0, humSum = 0, noiseSum = 0;
            let tempCnt = 0, humCnt = 0, noiseCnt = 0;
            dongSensors.forEach(s => {
                if (s.measurements.temp !== null && !isNaN(s.measurements.temp)) { tempSum += s.measurements.temp; tempCnt++; }
                if (s.measurements.humidity !== null && !isNaN(s.measurements.humidity)) { humSum += s.measurements.humidity; humCnt++; }
                if (s.measurements.noise !== null && !isNaN(s.measurements.noise)) { noiseSum += s.measurements.noise; noiseCnt++; }
            });
            apiDongData = {
                avgTemp: tempCnt > 0 ? tempSum / tempCnt : null,
                avgHum: humCnt > 0 ? humSum / humCnt : null,
                avgNoise: noiseCnt > 0 ? noiseSum / noiseCnt : null,
                sensorCount: dongSensors.length
            };
        }
    }

    updateInfoBox(`${selectedDistrict} ${dongName}`, null, apiDongData);
}

function updateInfoBox(name, data, apiData = null) {
    document.getElementById('infoName').textContent = name;

    // 실시간 API 데이터만 표시
    let tempVal = '-', humVal = '-', noiseVal = '-';
    let sensorCount = 0;

    if (apiData) {
        if (apiData.avgTemp !== null && !isNaN(apiData.avgTemp)) {
            tempVal = apiData.avgTemp.toFixed(1);
        }
        if (apiData.avgHum !== null && !isNaN(apiData.avgHum)) {
            humVal = apiData.avgHum.toFixed(0);
        }
        if (apiData.avgNoise !== null && !isNaN(apiData.avgNoise)) {
            noiseVal = apiData.avgNoise.toFixed(0);
        }
        sensorCount = apiData.sensorCount || apiData.tempCount || 0;
    }

    document.getElementById('infoTemp').textContent = tempVal !== '-' ? `${tempVal}°C` : '- °C';
    document.getElementById('infoHumidity').textContent = humVal !== '-' ? `${humVal}%` : '- %';

    // Replay 모드: DB에 소음/풍속/풍향 없으므로 비활성화
    if (replayMode.enabled) {
        document.getElementById('infoNoise').textContent = '- dB';
        document.getElementById('infoWindDir').textContent = '-';
        document.getElementById('infoWindSpeed').textContent = '- m/s';
        const arrow = document.getElementById('infoWindArrow');
        if (arrow) arrow.setAttribute('transform', 'rotate(0)');
    } else {
        document.getElementById('infoNoise').textContent = noiseVal !== '-' ? `${noiseVal} dB` : '- dB';

        // 풍향/풍속 (실시간 API 데이터)
        if (windData.direction !== null && !isNaN(windData.direction)) {
            document.getElementById('infoWindDir').textContent = `${getWindDirectionText(windData.direction)}풍`;
            const arrow = document.getElementById('infoWindArrow');
            if (arrow) arrow.setAttribute('transform', `rotate(${windData.direction + 180})`);
        } else {
            document.getElementById('infoWindDir').textContent = '-';
        }

        if (windData.speed !== null && !isNaN(windData.speed)) {
            document.getElementById('infoWindSpeed').textContent = `${windData.speed.toFixed(1)} m/s`;
        } else {
            document.getElementById('infoWindSpeed').textContent = '- m/s';
        }
    }

    // API 상태 배지 업데이트 (Replay 모드가 아닐 때만)
    const badge = document.getElementById('apiStatusBadge');
    if (badge && !replayMode.enabled) {
        if (apiDataCache.lastUpdate && Object.keys(apiDataCache.bySensor).length > 0) {
            badge.style.background = '#2ecc71';
            badge.textContent = 'LIVE';
        } else {
            badge.style.background = '#c0392b';
            badge.textContent = 'OFFLINE';
        }
    } else if (badge && replayMode.enabled) {
        badge.style.background = '#9b59b6';
        badge.textContent = 'REPLAY';
    }
}

// 센서 클릭 이벤트 핸들러
function handleSensorClick(sensor, projection, traceGroup, scale = 1) {
    console.log('========================================');
    console.log('🔍 센서 클릭 이벤트 발생!');
    console.log('  - 센서 ID:', sensor.id);
    console.log('  - 센서 위치:', sensor.lat, sensor.lng);
    console.log('  - projection 존재:', !!projection);
    console.log('  - traceGroup 존재:', !!traceGroup);
    console.log('  - API 캐시 센서 수:', Object.keys(apiDataCache.bySensor || {}).length);

    const sensorData = getSensorData(sensor.id);

    console.log('  - getSensorData 결과:', sensorData);
    console.log('  - 상태:', sensorData?.status);
    console.log('  - 대기오염 감지:', sensorData?.pollutionDetected);
    console.log('  - 이상항목:', sensorData?.abnormalItems);

    // API 데이터가 없거나 정상 센서는 클릭해도 역추적선 표시 안함
    if (!sensorData || sensorData.status === 'normal') {
        console.log('  ❌ 정상 센서 - 역추적 안함');
        console.log('========================================');
        return;
    }

    // 같은 센서를 다시 클릭하면 역추적선 숨김
    if (selectedSensorForTraceback === sensor.id) {
        hideTraceback(traceGroup);
        selectedSensorForTraceback = null;
        console.log('  → 역추적선 숨김');
        return;
    }

    console.log('  → 역추적선 표시 시작');

    selectedSensorForTraceback = sensor.id;

    // 기존 역추적선 제거
    traceGroup.selectAll('*').remove();

    // traceGroup을 최상위로 이동 (다른 요소들 위에 표시)
    traceGroup.raise();

    // 최초 발원지까지 추적 (서울 경계를 벗어날 때까지)
    const originDirection = windData.direction;
    const stepDistance = 0.008; // 한 단계당 이동 거리 (약 800m)
    const radians = originDirection * Math.PI / 180;
    const maxSteps = 50; // 최대 추적 단계 (무한루프 방지)

    let currentLat = sensor.lat;
    let currentLng = sensor.lng;
    let originLat = sensor.lat;
    let originLng = sensor.lng;
    let exitedSeoul = false;
    let lastInsideLocation = null;

    // 풍향을 따라 서울 경계를 벗어날 때까지 추적
    for (let step = 0; step < maxSteps; step++) {
        // 풍향 방향으로 한 단계 이동
        currentLat += Math.cos(radians) * stepDistance;
        currentLng += Math.sin(radians) * stepDistance;

        // 현재 위치가 서울 내에 있는지 확인
        const location = findLocationByCoords(currentLng, currentLat);

        if (location.district) {
            // 아직 서울 내에 있음 - 계속 추적
            lastInsideLocation = location;
            originLat = currentLat;
            originLng = currentLng;
        } else {
            // 서울 경계를 벗어남 - 최종 발원지는 서울 외곽
            exitedSeoul = true;
            // 발원지 마커 위치는 서울 경계 바로 밖으로 설정
            originLat = currentLat;
            originLng = currentLng;
            break;
        }
    }

    const sensorPos = projection([sensor.lng, sensor.lat]);
    let originPos = projection([originLng, originLat]);

    if (!sensorPos || !originPos) return;

    // 최종 발원지 라벨 생성 및 이동할 구 결정
    let originLabel;
    let targetDistrict = null; // 클릭 시 이동할 구
    let targetDong = null;    // 클릭 시 이동할 동

    if (exitedSeoul) {
        // 서울 외곽으로 추적됨 - 마지막으로 거쳐온 구 정보도 표시
        if (lastInsideLocation) {
            originLabel = `⚠ 추정 발원지: 서울 외곽 (${lastInsideLocation.district} 방면)`;
            targetDistrict = lastInsideLocation.district;
            targetDong = lastInsideLocation.dong;
        } else {
            originLabel = '⚠ 추정 발원지: 서울 외곽';
        }
    } else {
        // 서울 내에서 추적 종료 (maxSteps 도달)
        const finalLocation = findLocationByCoords(originLng, originLat);
        originLabel = `⚠ 추정 발원지: ${finalLocation.district}${finalLocation.dong ? ' ' + finalLocation.dong : ''} 방면`;
        targetDistrict = finalLocation.district;
        targetDong = finalLocation.dong;
    }

    // 마커 표시 거리 제한 (화면 내에 보이도록) - 스케일 적용
    const maxDisplayDistance = 120 / scale; // 최대 표시 거리 (스케일에 맞게 조정)
    const dx = originPos[0] - sensorPos[0];
    const dy = originPos[1] - sensorPos[1];
    const actualDistance = Math.sqrt(dx * dx + dy * dy);

    if (actualDistance > maxDisplayDistance) {
        // 거리가 너무 멀면 최대 거리로 제한
        const ratio = maxDisplayDistance / actualDistance;
        originPos = [
            sensorPos[0] + dx * ratio,
            sensorPos[1] + dy * ratio
        ];
    }

    // 클릭 시 해당 구/동으로 이동하는 핸들러
    const handleOriginClick = targetDistrict ? function(event) {
        event.stopPropagation();

        // 이미 해당 위치에 있으면 이동하지 않음
        const alreadyAtDistrict = selectedDistrict === targetDistrict;
        const alreadyAtDong = !targetDong || selectedDong === targetDong ||
            (selectedDong && targetDong && (
                selectedDong.includes(targetDong.replace(/[0-9·]/g, '')) ||
                targetDong.includes(selectedDong.replace(/[0-9·]/g, ''))
            ));

        if (alreadyAtDistrict && alreadyAtDong) {
            console.log('🎯 발원지 클릭 - 이미 해당 위치에 있음');
            return;
        }

        console.log('🎯 발원지 클릭 - 이동할 구:', targetDistrict, ', 동:', targetDong);
        navigateToDistrict(targetDistrict, targetDong);
    } : null;

    // 발원지 마커 먼저 그리기 (스케일 적용)
    const markerRadius = 10 / scale;
    const originMarker = traceGroup.append('circle')
        .attr('class', 'origin-marker')
        .attr('cx', originPos[0])
        .attr('cy', originPos[1])
        .attr('r', 0)
        .attr('stroke-width', 2 / scale)
        .style('cursor', targetDistrict ? 'pointer' : 'default');

    // 클릭 이벤트는 transition 전에 추가
    if (handleOriginClick) {
        originMarker.on('click', handleOriginClick);
    }

    // 애니메이션 적용
    originMarker.transition()
        .duration(400)
        .attr('r', markerRadius);

    // 라벨 배경 (가독성 향상) - 스케일 적용
    const fontSize = 12 / scale;
    const labelWidth = (originLabel.length * 12 + 24) / scale;
    const labelHeight = 24 / scale;
    const labelY = originPos[1] - (38 / scale);

    traceGroup.append('rect')
        .attr('class', 'origin-label-bg')
        .attr('x', originPos[0] - labelWidth / 2)
        .attr('y', labelY)
        .attr('width', labelWidth)
        .attr('height', labelHeight)
        .attr('rx', 5 / scale)
        .attr('ry', 5 / scale)
        .attr('fill', 'rgba(155, 89, 182, 0.95)')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5 / scale)
        .attr('opacity', 0)
        .style('cursor', targetDistrict ? 'pointer' : 'default')
        .on('click', handleOriginClick)
        .transition()
        .duration(300)
        .delay(200)
        .attr('opacity', 1);

    traceGroup.append('text')
        .attr('class', 'origin-label')
        .attr('x', originPos[0])
        .attr('y', labelY + labelHeight / 2 + (1 / scale))
        .attr('font-size', fontSize + 'px')
        .attr('opacity', 0)
        .style('cursor', targetDistrict ? 'pointer' : 'default')
        .style('pointer-events', 'all')
        .text(originLabel)
        .on('click', handleOriginClick)
        .transition()
        .duration(300)
        .delay(200)
        .attr('opacity', 1);

    // 역추적선 그리기 (발원지 → 센서 방향) - 스케일 적용
    const statusColor = sensorData.status === 'danger' ? '#e74c3c' : '#f39c12';
    const lineStrokeWidth = 2 / scale;
    const dashArray = `${8 / scale}, ${4 / scale}`;

    traceGroup.append('line')
        .attr('class', `traceback-line status-${sensorData.status}`)
        .attr('x1', originPos[0])
        .attr('y1', originPos[1])
        .attr('x2', originPos[0])
        .attr('y2', originPos[1])
        .attr('stroke-width', lineStrokeWidth)
        .attr('stroke-dasharray', dashArray)
        .transition()
        .duration(500)
        .delay(300)
        .attr('x2', sensorPos[0])
        .attr('y2', sensorPos[1]);

    // 화살표 (발원지 → 센서 방향으로 센서 쪽에 표시) - 스케일 적용
    const angle = Math.atan2(sensorPos[1] - originPos[1], sensorPos[0] - originPos[0]);
    const arrowSize = 10 / scale;

    // 화살표를 센서 바로 앞에 위치시키기 (센서에서 떨어진 곳)
    const arrowDist = 15 / scale;
    const arrowX = sensorPos[0] - Math.cos(angle) * arrowDist;
    const arrowY = sensorPos[1] - Math.sin(angle) * arrowDist;

    traceGroup.append('polygon')
        .attr('points', `0,-${arrowSize/2} ${arrowSize},0 0,${arrowSize/2}`)
        .attr('fill', statusColor)
        .attr('opacity', 0)
        .attr('transform', `translate(${arrowX}, ${arrowY}) rotate(${angle * 180 / Math.PI})`)
        .transition()
        .duration(300)
        .delay(700)
        .attr('opacity', 0.9);
}

// 역추적선 숨기기
function hideTraceback(traceGroup) {
    traceGroup.selectAll('*')
        .transition()
        .duration(300)
        .attr('opacity', 0)
        .remove();
}

// 센서 툴팁 표시 (실시간 API 데이터만)
function showSensorTooltip(event, sensor) {
    let tooltip = document.getElementById('sensorTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'sensorTooltip';
        tooltip.className = 'sensor-tooltip';
        document.querySelector('.map-container').appendChild(tooltip);
    }

    const sensorDataObj = getSensorData(sensor.id);
    const status = sensorDataObj.status;
    const statusText = status === 'danger' ? '위험' : status === 'warning' ? '주의' : status === 'unknown' ? '데이터없음' : '정상';
    const statusColor = status === 'danger' ? '#e74c3c' : status === 'warning' ? '#f39c12' : status === 'unknown' ? '#7f8c8d' : '#2ecc71';

    // API에서 가져온 실시간 데이터 표시
    const apiSensor = apiDataCache.bySensor[sensor.id];
    let realtimeHtml = '';

    if (apiSensor && apiSensor.measurements) {
        const m = apiSensor.measurements;
        const formatVal = (val, unit, decimals = 1) => {
            if (val === null || isNaN(val)) return '-';
            return val.toFixed(decimals) + unit;
        };

        realtimeHtml = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(0, 217, 255, 0.3);">
                <div style="font-weight: bold; color: #00d9ff; margin-bottom: 4px; font-size: 10px;">📡 실시간 측정값</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; font-size: 9px;">
                    <span style="color: #a0a0a0;">온도:</span><span>${formatVal(m.temp, '°C')}</span>
                    <span style="color: #a0a0a0;">습도:</span><span>${formatVal(m.humidity, '%', 0)}</span>
                    <span style="color: #a0a0a0;">소음:</span><span>${formatVal(m.noise, 'dB', 0)}</span>
                    <span style="color: #a0a0a0;">조도:</span><span>${formatVal(m.light, 'lux', 0)}</span>
                    <span style="color: #a0a0a0;">자외선:</span><span>${formatVal(m.uv, '')}</span>
                    <span style="color: #a0a0a0;">풍속:</span><span>${formatVal(m.windSpeed, 'm/s')}</span>
                </div>
                ${apiSensor.measurementTime ? `<div style="margin-top: 4px; font-size: 8px; color: #00d9ff;">측정: ${apiSensor.measurementTime.replace('_', ' ')}</div>` : ''}
            </div>
        `;
    } else {
        realtimeHtml = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(127, 140, 141, 0.3);">
                <div style="font-weight: bold; color: #7f8c8d; margin-bottom: 4px; font-size: 10px;">⏳ 데이터 수신 대기중</div>
                <div style="font-size: 9px; color: #666;">API에서 데이터를 불러오는 중입니다...</div>
            </div>
        `;
    }

    // 이상 항목 목록 생성
    let abnormalHtml = '';
    if (sensorDataObj.abnormalItems && sensorDataObj.abnormalItems.length > 0) {
        abnormalHtml = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2);">
                <div style="font-weight: bold; color: ${statusColor}; margin-bottom: 4px;">⚠ 이상 감지 항목</div>
                ${sensorDataObj.abnormalItems.map(item => {
                    const levelColor = item.level === 'danger' ? '#e74c3c' : '#f39c12';
                    const levelText = item.level === 'danger' ? '위험' : '주의';
                    return `<div style="font-size: 10px; color: ${levelColor}; margin: 2px 0;">
                        • ${item.name}: ${item.value.toFixed(2)}${item.unit} [${levelText}]
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    // 이상 센서 클릭 안내
    const clickHint = (status === 'warning' || status === 'danger') ?
        `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2); color: #9b59b6; font-size: 10px;">
            💡 클릭하여 발원지 추적
        </div>` : '';

    tooltip.innerHTML = `
        <div style="font-weight: bold; color: ${statusColor}; margin-bottom: 4px;">S-DoT 센서 [${statusText}]</div>
        <div>ID: ${sensor.id}</div>
        <div>동: ${sensor.dong || apiSensor?.dong || '-'}</div>
        <div>위도: ${sensor.lat.toFixed(6)}</div>
        <div>경도: ${sensor.lng.toFixed(6)}</div>
        ${realtimeHtml}
        ${abnormalHtml}
        ${clickHint}
    `;

    tooltip.style.borderColor = statusColor;

    const mapContainer = document.querySelector('.map-container');
    const rect = mapContainer.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
    tooltip.style.top = (event.clientY - rect.top - 10) + 'px';
    tooltip.classList.add('visible');
}

function hideSensorTooltip() {
    const tooltip = document.getElementById('sensorTooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
    }
}

// 클릭 이벤트
function handleDistrictClick(event, d) {
    selectedDistrict = d.properties.name;
    selectedDong = null;
    zoomIntoDistrict(event.target, d);
}

function handleDongClick(event, d) {
    selectedDong = d.properties.name;
    d3.selectAll('.dong-path').classed('selected', false);
    d3.select(event.target).classed('selected', true);

    // 역추적선 숨기기
    selectedSensorForTraceback = null;
    d3.selectAll('.traceback-group *').remove();

    // 해당 동으로 줌인
    zoomIntoDong(event.target, d);
}
