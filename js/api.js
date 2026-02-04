// api.js - API 데이터 처리

// S-DoT API에서 실시간 데이터 가져오기 (FastAPI 프록시 경유)
async function fetchSdotApiData(districtKo = null) {
    try {
        let url = `${REPLAY_API_BASE}/api/v1/sdot-proxy`;
        if (districtKo && districtNameMap[districtKo]) {
            url += `?district=${encodeURIComponent(districtNameMap[districtKo])}`;
        }

        console.log('S-DoT API 프록시 호출:', url);
        const response = await fetch(url);
        const result = await response.json();

        // 결과 처리
        if (result[SDOT_SERVICE] && result[SDOT_SERVICE].RESULT.CODE === 'INFO-000') {
            const rows = result[SDOT_SERVICE].row || [];
            console.log(`S-DoT API 데이터 수신: ${rows.length}건`);
            return rows;
        } else if (result.RESULT && result.RESULT.CODE === 'INFO-200') {
            console.warn('데이터 없음');
            return [];
        } else {
            const errMsg = result[SDOT_SERVICE]?.RESULT?.MESSAGE || result.RESULT?.MESSAGE || 'Unknown error';
            console.warn('S-DoT API 오류:', errMsg);
            return [];
        }
    } catch (error) {
        console.error('S-DoT API 호출 실패:', error);
        return [];
    }
}

// API 데이터를 구별/센서별로 정리
function processApiData(rows) {
    const byDistrict = {};
    const bySensor = {};

    rows.forEach(row => {
        const districtEn = row.CGG;
        const districtKo = row.CGG_KO || districtNameMapReverse[districtEn] || districtEn;
        const sensorId = row.SN;
        const dongName = row.DONG_KO || row.DONG;

        // 구별 데이터 집계
        if (!byDistrict[districtKo]) {
            byDistrict[districtKo] = {
                sensors: [],
                avgTemp: 0,
                avgHum: 0,
                avgNoise: 0,
                tempCount: 0,
                humCount: 0,
                noiseCount: 0
            };
        }

        // 온도 평균 집계
        const temp = parseFloat(row.AVG_TP);
        if (!isNaN(temp) && temp > -50 && temp < 60) {
            byDistrict[districtKo].avgTemp += temp;
            byDistrict[districtKo].tempCount++;
        }

        // 습도 평균 집계
        const hum = parseFloat(row.AVG_HUM);
        if (!isNaN(hum) && hum >= 0 && hum <= 100) {
            byDistrict[districtKo].avgHum += hum;
            byDistrict[districtKo].humCount++;
        }

        // 소음 평균 집계
        const noise = parseFloat(row.AVG_NIS);
        if (!isNaN(noise) && noise >= 0 && noise < 150) {
            byDistrict[districtKo].avgNoise += noise;
            byDistrict[districtKo].noiseCount++;
        }

        byDistrict[districtKo].sensors.push(sensorId);

        // 센서별 데이터
        // 좌표: API 응답 > sensorLocationMap(하드코딩) 순으로 fallback
        const locFromApi = (row.LAT && row.LNG) ? { lat: parseFloat(row.LAT), lng: parseFloat(row.LNG) } : null;
        const locFromMap = sensorLocationMap[sensorId] || null;
        const sensorLoc = locFromApi || locFromMap;
        if (!sensorLoc) return; // 좌표 없는 센서는 제외

        bySensor[sensorId] = {
            district: districtKo,
            dong: dongName,
            lat: sensorLoc.lat,
            lng: sensorLoc.lng,
            measurements: {
                temp: parseFloat(row.AVG_TP) || null,
                tempMax: parseFloat(row.MAX_TP) || null,
                tempMin: parseFloat(row.MIN_TP) || null,
                humidity: parseFloat(row.AVG_HUM) || null,
                humMax: parseFloat(row.MAX_HUM) || null,
                humMin: parseFloat(row.MIN_HUM) || null,
                noise: parseFloat(row.AVG_NIS) || null,
                noiseMax: parseFloat(row.MAX_NIS) || null,
                noiseMin: parseFloat(row.MIN_NIS) || null,
                light: parseFloat(row.AVG_INILLU) || null,
                uv: parseFloat(row.AVG_UV) || null,
                windSpeed: parseFloat(row.AVG_WSPD) || null,
                windDir: parseFloat(row.AVG_WD) || null,
                vibrationX: parseFloat(row.AVG_VIBR_XCRD) || null,
                vibrationY: parseFloat(row.AVG_VIBR_YCRD) || null,
                vibrationZ: parseFloat(row.AVG_VIBR_ZCRD) || null,
                blackGlobe: parseFloat(row.AVG_GT) || null,
                no2: parseFloat(row.AVG_NTDX) || null,
                co: parseFloat(row.AVG_CBMX) || null,
                so2: parseFloat(row.AVG_SO) || null,
                nh3: parseFloat(row.AVG_NH3) || null,
                h2s: parseFloat(row.AVG_H2S) || null,
                o3: parseFloat(row.AVG_OZON) || null
            },
            measurementTime: row.MSRMT_HR,
            registeredAt: row.REG_DT,
            region: row.RGN
        };
    });

    // 구별 평균 계산
    Object.keys(byDistrict).forEach(district => {
        const d = byDistrict[district];
        if (d.tempCount > 0) d.avgTemp /= d.tempCount;
        if (d.humCount > 0) d.avgHum /= d.humCount;
        if (d.noiseCount > 0) d.avgNoise /= d.noiseCount;
    });

    return { byDistrict, bySensor };
}

// 실시간 데이터로 대시보드 업데이트
async function updateFromApi() {
    const rows = await fetchSdotApiData();
    if (rows.length > 0) {
        const processed = processApiData(rows);
        apiDataCache = {
            lastUpdate: new Date(),
            data: rows,
            byDistrict: processed.byDistrict,
            bySensor: processed.bySensor
        };

        // 구별 데이터 업데이트
        updateDistrictDataFromApi();

        // 센서 상태 업데이트
        updateSensorStatusFromApi();

        // 풍향/풍속 업데이트 (API 데이터 기반)
        updateWindDataFromApi();

        // 상태 표시 업데이트
        updateApiStatusDisplay();

        // 데이터 갱신 시간 표시 업데이트
        updateDataRefreshTime(rows);

        // 대기오염 물질 체크
        checkAllSensorsForPollution();

        console.log('대시보드 데이터 업데이트 완료:', new Date().toLocaleTimeString());
    }
}

// 데이터 갱신 시간 표시 업데이트
function updateDataRefreshTime(rows) {
    const lastDataTimeEl = document.getElementById('lastDataTime');
    if (!lastDataTimeEl || !rows || rows.length === 0) return;

    // 디버깅: 첫번째 row의 키 확인
    if (rows[0]) {
        console.log('API 데이터 필드:', Object.keys(rows[0]));
    }

    // API 데이터에서 가장 최근 측정 시간 찾기
    // MSRMT_HR 형식: YYYYMMDD_HHMMSS (예: 20260202_143000)
    // REG_DT 형식: YYYY-MM-DD HH:MM:SS (예: 2026-02-02 14:30:00)
    let latestTime = null;
    let latestTimeStr = '';
    let useRegDt = false;

    rows.forEach(row => {
        // 먼저 MSRMT_HR 체크
        if (row.MSRMT_HR) {
            const timeStr = row.MSRMT_HR;
            if (!latestTime || timeStr > latestTime) {
                latestTime = timeStr;
                useRegDt = false;
            }
        }
        // MSRMT_HR 없으면 REG_DT 사용
        else if (row.REG_DT) {
            const timeStr = row.REG_DT;
            if (!latestTime || timeStr > latestTime) {
                latestTime = timeStr;
                useRegDt = true;
            }
        }
    });

    if (latestTime) {
        if (useRegDt) {
            // REG_DT는 이미 YYYY-MM-DD HH:MM:SS 형식
            latestTimeStr = latestTime;
        } else {
            // MSRMT_HR 형식 파싱
            const parts = latestTime.split('_');
            if (parts.length === 2) {
                const datePart = parts[0];
                const timePart = parts[1];

                // 형식 1: YYYY-MM-DD_HH:MM:SS (구분자 포함)
                if (datePart.includes('-')) {
                    latestTimeStr = `${datePart} ${timePart}`;
                }
                // 형식 2: YYYYMMDD_HHMMSS (구분자 없음)
                else if (datePart.length === 8 && timePart.length >= 4) {
                    const year = datePart.substring(0, 4);
                    const month = datePart.substring(4, 6);
                    const day = datePart.substring(6, 8);
                    const hour = timePart.substring(0, 2);
                    const min = timePart.substring(2, 4);
                    const sec = timePart.length >= 6 ? timePart.substring(4, 6) : '00';

                    latestTimeStr = `${year}-${month}-${day} ${hour}:${min}:${sec}`;
                }
                // 기타: 그대로 표시
                else {
                    latestTimeStr = latestTime.replace('_', ' ');
                }
            } else {
                // 언더스코어 없으면 그대로 표시
                latestTimeStr = latestTime;
            }
        }
    }

    console.log('최근 데이터 시간:', latestTimeStr);
    lastDataTimeEl.textContent = latestTimeStr || '--:--:--';
}

// API 데이터로 구별 데이터 업데이트
function updateDistrictDataFromApi() {
    Object.keys(apiDataCache.byDistrict).forEach(districtKo => {
        const apiData = apiDataCache.byDistrict[districtKo];
        if (districtData[districtKo]) {
            // 실제 온도/습도 데이터 반영
            if (apiData.tempCount > 0) {
                districtData[districtKo].temp = apiData.avgTemp;
            }
            if (apiData.humCount > 0) {
                districtData[districtKo].humidity = apiData.avgHum;
            }
            // PM2.5는 API에서 제공하지 않으므로 Mock 유지 (미세먼지법에 따라 비공개)
        }
    });
}

// API 데이터로 센서 상태 업데이트
function updateSensorStatusFromApi() {
    Object.keys(apiDataCache.bySensor).forEach(sensorId => {
        const apiSensorData = apiDataCache.bySensor[sensorId];
        const m = apiSensorData.measurements;

        // 기존 sensorStatus에 실제 측정값 반영
        if (sensorStatus[sensorId]) {
            // 실제 측정값으로 업데이트
            if (m.temp !== null) sensorStatus[sensorId].measurements.temp = m.temp;
            if (m.humidity !== null) sensorStatus[sensorId].measurements.humidity = m.humidity;
            if (m.noise !== null) sensorStatus[sensorId].measurements.noise = m.noise;
            if (m.light !== null) sensorStatus[sensorId].measurements.light = m.light;
            if (m.uv !== null) sensorStatus[sensorId].measurements.uv = m.uv;
            if (m.vibrationX !== null) sensorStatus[sensorId].measurements.vibration = Math.max(m.vibrationX, m.vibrationY || 0, m.vibrationZ || 0);
            if (m.windSpeed !== null) sensorStatus[sensorId].measurements.windSpeed = m.windSpeed;
            if (m.windDir !== null) sensorStatus[sensorId].measurements.windDir = m.windDir;
            if (m.o3 !== null) sensorStatus[sensorId].measurements.o3 = m.o3;
            if (m.no2 !== null) sensorStatus[sensorId].measurements.no2 = m.no2;
            if (m.co !== null) sensorStatus[sensorId].measurements.co = m.co;
            if (m.so2 !== null) sensorStatus[sensorId].measurements.so2 = m.so2;
            if (m.nh3 !== null) sensorStatus[sensorId].measurements.nh3 = m.nh3;
            if (m.h2s !== null) sensorStatus[sensorId].measurements.h2s = m.h2s;
            if (m.blackGlobe !== null) sensorStatus[sensorId].measurements.blackGlobe = m.blackGlobe;

            // 이상값 재확인
            const abnormalItems = checkAbnormalItems(sensorStatus[sensorId].measurements);
            sensorStatus[sensorId].abnormalItems = abnormalItems;

            let status = 'normal';
            if (abnormalItems.some(item => item.level === 'danger')) {
                status = 'danger';
            } else if (abnormalItems.length > 0) {
                status = 'warning';
            }
            sensorStatus[sensorId].status = status;
        }
    });
}

// API 데이터에서 풍향/풍속 추출
function updateWindDataFromApi() {
    let totalWindDir = 0, totalWindSpeed = 0;
    let windDirCount = 0, windSpeedCount = 0;

    Object.values(apiDataCache.bySensor).forEach(sensor => {
        const m = sensor.measurements;
        if (m.windDir !== null && !isNaN(m.windDir)) {
            totalWindDir += m.windDir;
            windDirCount++;
        }
        if (m.windSpeed !== null && !isNaN(m.windSpeed)) {
            totalWindSpeed += m.windSpeed;
            windSpeedCount++;
        }
    });

    if (windDirCount > 0) {
        windData.direction = totalWindDir / windDirCount;
    }
    if (windSpeedCount > 0) {
        windData.speed = totalWindSpeed / windSpeedCount;
    }
}

// API 상태 표시 업데이트
function updateApiStatusDisplay() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-indicator span');

    if (apiDataCache.lastUpdate) {
        const timeDiff = (new Date() - apiDataCache.lastUpdate) / 1000;
        if (timeDiff < 120) {
            statusDot.style.background = 'var(--success)';
            statusText.textContent = `실시간 연결됨 (1155건)`;
        } else {
            statusDot.style.background = 'var(--warning)';
            statusText.textContent = '데이터 갱신 중...';
        }
    }
}
