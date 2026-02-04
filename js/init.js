// init.js - 초기화 및 GeoJSON 로딩

// DB에서 센서 위치 데이터 로딩
async function loadSensorDataFromDB() {
    try {
        const response = await fetch(`${REPLAY_API_BASE}/api/v1/sensors`);
        const result = await response.json();
        if (result.sensorData) {
            sensorData = result.sensorData;
            // sensorLocationMap 빌드
            sensorLocationMap = {};
            Object.keys(sensorData).forEach(district => {
                Object.keys(sensorData[district]).forEach(dong => {
                    sensorData[district][dong].forEach(s => {
                        sensorLocationMap[s.id] = { lat: s.lat, lng: s.lng };
                    });
                });
            });
            console.log(`센서 데이터 DB 로드 완료: ${result.count}개`);
        }
        if (result.asosStations) asosStations = result.asosStations;
        if (result.awsStations) awsStations = result.awsStations;
    } catch (error) {
        console.error('센서 데이터 DB 로드 실패:', error);
    }
}

// 초기화
async function init() {
    const loadingEl = document.querySelector('#seoulMap .loading span');

    // DB에서 센서 위치 데이터 로딩
    if (loadingEl) loadingEl.textContent = '센서 위치 데이터 로딩 중...';
    await loadSensorDataFromDB();

    // Replay 날짜 입력 초기화
    initReplayDateInput();

    // 이벤트 핸들러 초기화
    initEventHandlers();

    // 구별 데이터 구조 초기화
    initDistrictData();

    // GeoJSON 로드
    if (loadingEl) loadingEl.textContent = '지도 데이터 로딩 중...';
    await loadGeoJSON();
    await loadDongGeoJSON();

    // 실시간 API 데이터 로드
    if (loadingEl) loadingEl.textContent = '실시간 센서 데이터 로딩 중...';
    await updateFromApi();

    // 지도 렌더링 (API 데이터 로드 후)
    if (loadingEl) loadingEl.textContent = '지도 렌더링 중...';
    renderMap();

    // 초기 풍향/풍속 정보 표시
    updateWindIndicator();

    updateTime();
    setInterval(updateTime, 1000);

    // 초기 HTTP 상태 확인
    checkHttpStatus();

    // 실시간 API 데이터 갱신 (30초마다)
    setInterval(async () => {
        await updateFromApi();
        updateMapColorsFromApi();
    }, 30000);

    // 지도 색상 업데이트 (API 데이터 기반)
    setInterval(updateMapColorsFromApi, 5000);

    // 경보 업데이트
    updateAlertFromApi();
    setInterval(updateAlertFromApi, 10000);

    // 풍향/풍속 표시 업데이트
    setInterval(updateWindIndicator, 5000);
}

// GeoJSON 로드 (렌더링 없이 데이터만 로드)
async function loadGeoJSON() {
    try {
        const response = await fetch(GEOJSON_URL);
        geoData = await response.json();
        console.log('GeoJSON 로드 완료:', geoData.features.length, '개 구');
    } catch (error) {
        console.error('GeoJSON 로드 실패:', error);
        document.getElementById('seoulMap').innerHTML = '<div class="loading"><span>지도 로드 실패. 새로고침 해주세요.</span></div>';
    }
}

async function loadDongGeoJSON() {
    try {
        const response = await fetch(DONG_GEOJSON_URL);
        dongGeoData = await response.json();
    } catch (error) {
        console.error('동 GeoJSON 로드 실패:', error);
    }
}

// 구별 데이터 구조 초기화 (실시간 데이터로 채워짐)
function initDistrictData() {
    const names = Object.keys(districtCodes);
    names.forEach(name => {
        districtData[name] = {
            temp: null,
            humidity: null,
            noise: null,
            sensorCount: 0,
            lastUpdate: null
        };
    });
}

// 동별 데이터 초기화 (API 데이터 기반)
function initDongDataForDistrict(districtName) {
    if (!dongGeoData) return;
    const code = districtCodes[districtName];
    if (!code) return;

    dongGeoData.features.forEach(f => {
        if (f.properties.code && f.properties.code.startsWith(code)) {
            const dongName = f.properties.name;
            const key = `${districtName}_${dongName}`;
            if (!dongData[key]) {
                dongData[key] = {
                    temp: null,
                    humidity: null,
                    noise: null,
                    sensorCount: 0
                };
            }
        }
    });

    // API 캐시에서 해당 구의 동별 데이터 채우기
    if (apiDataCache.bySensor) {
        Object.values(apiDataCache.bySensor).forEach(sensor => {
            if (sensor.district === districtName) {
                // 동 이름 매칭 시도
                const dongKeys = Object.keys(dongData).filter(k => k.startsWith(districtName + '_'));
                dongKeys.forEach(key => {
                    const dongName = key.replace(districtName + '_', '');
                    // API 동 이름과 GeoJSON 동 이름 매칭
                    // 동 이름 매칭: 숫자/가/동 접미사 제거 후 비교
                    const dongBase = dongName.replace(/[0-9()·동가]/g, '');
                    const sensorDongBase = sensor.dong ? sensor.dong.replace(/[0-9()·동가\-]/g, '').replace(/(il|i|sam|sa|o|yuk|chil|pal|gu|sip)/g, '') : '';
                    if (sensor.dong && (
                        sensor.dong.includes(dongName) ||
                        dongName.includes(sensor.dong.replace(/[0-9가]*/g, '')) ||
                        dongBase === sensorDongBase ||
                        (dongBase.length >= 2 && sensorDongBase.includes(dongBase)) ||
                        (sensorDongBase.length >= 2 && dongBase.includes(sensorDongBase))
                    )) {
                        const m = sensor.measurements;
                        if (m.temp !== null) {
                            if (dongData[key].temp === null) {
                                dongData[key].temp = m.temp;
                                dongData[key].sensorCount = 1;
                            } else {
                                dongData[key].temp = (dongData[key].temp * dongData[key].sensorCount + m.temp) / (dongData[key].sensorCount + 1);
                                dongData[key].sensorCount++;
                            }
                        }
                        if (m.humidity !== null) dongData[key].humidity = m.humidity;
                        if (m.noise !== null) dongData[key].noise = m.noise;
                    }
                });
            }
        });
    }
}

// 이벤트 핸들러 바인딩 (인라인 이벤트 대체)
function initEventHandlers() {
    // 센서 토글
    const toggleAsos = document.getElementById('toggleAsos');
    const toggleAws = document.getElementById('toggleAws');
    const toggleSdot = document.getElementById('toggleSdot');
    if (toggleAsos) toggleAsos.addEventListener('click', () => toggleSensorLayer('asos'));
    if (toggleAws) toggleAws.addEventListener('click', () => toggleSensorLayer('aws'));
    if (toggleSdot) toggleSdot.addEventListener('click', () => toggleSensorLayer('sdot'));

    // 리플레이 토글
    const replayToggle = document.getElementById('replayToggle');
    if (replayToggle) replayToggle.addEventListener('click', toggleReplayMode);

    // 리플레이 날짜
    const replayDate = document.getElementById('replayDate');
    if (replayDate) replayDate.addEventListener('change', onReplayDateChange);

    // 리플레이 슬라이더
    const replaySlider = document.getElementById('replaySlider');
    if (replaySlider) replaySlider.addEventListener('input', (e) => onReplaySliderChange(e.target.value));

    // 리플레이 컨트롤 버튼
    const prevBtn = document.getElementById('replayPrevBtn');
    const playBtn = document.getElementById('replayPlayBtn');
    const nextBtn = document.getElementById('replayNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', replayPrevHour);
    if (playBtn) playBtn.addEventListener('click', toggleReplayPlay);
    if (nextBtn) nextBtn.addEventListener('click', replayNextHour);

    // 뒤로가기 버튼
    const backButton = document.getElementById('backButton');
    if (backButton) backButton.addEventListener('click', zoomOut);
}

// 시작 - DOM 완전히 로드된 후 실행
window.addEventListener('load', init);
