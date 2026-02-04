// anomaly.js - 이상감지 및 경보 시스템

// 풍향/풍속 데이터 (실시간 API에서 업데이트됨)
let windData = {
    direction: null,  // 풍향 (도, 0=북, 90=동, 180=남, 270=서)
    speed: null       // 풍속 (m/s)
};

// 측정항목 정의 (이상값 판단 기준)
const measurementTypes = [
    { id: 'temp', name: '온도', unit: '°C', threshold: { warning: 35, danger: 40 } },
    { id: 'humidity', name: '습도', unit: '%', threshold: { warning: 85, danger: 95 } },
    { id: 'light', name: '조도', unit: 'lux', threshold: { warning: 10000, danger: 50000 } },
    { id: 'noise', name: '소음', unit: 'dB', threshold: { warning: 70, danger: 90 } },
    { id: 'vibration', name: '진동', unit: 'mm/s', threshold: { warning: 5, danger: 10 } },
    { id: 'uv', name: '자외선', unit: 'UV지수', threshold: { warning: 6, danger: 11 } },
    { id: 'windDir', name: '풍향', unit: '°', threshold: null },
    { id: 'windSpeed', name: '풍속', unit: 'm/s', threshold: { warning: 10, danger: 20 } },
    { id: 'o3', name: '오존(O3)', unit: 'ppm', threshold: { warning: 0.09, danger: 0.15 } },
    { id: 'nh3', name: '암모니아(NH3)', unit: 'ppm', threshold: { warning: 1, danger: 5 } },
    { id: 'h2s', name: '황화수소(H2S)', unit: 'ppm', threshold: { warning: 0.02, danger: 0.1 } },
    { id: 'co', name: '일산화탄소(CO)', unit: 'ppm', threshold: { warning: 9, danger: 25 } },
    { id: 'no2', name: '이산화질소(NO2)', unit: 'ppm', threshold: { warning: 0.06, danger: 0.2 } },
    { id: 'so2', name: '이산화황(SO2)', unit: 'ppm', threshold: { warning: 0.05, danger: 0.15 } },
    { id: 'blackGlobe', name: '흑구온도', unit: '°C', threshold: { warning: 40, danger: 50 } }
];

// 센서 상태 데이터 (센서ID -> { status, abnormalItems, measurements })
let sensorStatus = {};

// 이상 항목 확인 (실시간 데이터 기반)
function checkAbnormalItems(measurements) {
    const abnormalItems = [];
    measurementTypes.forEach(type => {
        if (type.threshold && measurements[type.id] !== undefined && measurements[type.id] !== null) {
            const value = measurements[type.id];
            if (value >= type.threshold.danger) {
                abnormalItems.push({ ...type, value, level: 'danger' });
            } else if (value >= type.threshold.warning) {
                abnormalItems.push({ ...type, value, level: 'warning' });
            }
        }
    });
    return abnormalItems;
}

// 센서 상태 가져오기 (실시간 API 데이터 기반)
function getSensorStatus(sensorId) {
    const data = getSensorData(sensorId);
    return data ? data.status : 'unknown';
}

// 센서 상세 정보 가져오기 (실시간 API 데이터)
function getSensorData(sensorId) {
    // API 캐시에서 실시간 데이터 가져오기
    const apiSensor = apiDataCache.bySensor[sensorId];
    if (apiSensor) {
        const measurements = apiSensor.measurements;
        const abnormalItems = checkAbnormalItems(measurements);

        // 대기오염 물질 임계값 초과 체크 (추가)
        const pollutionDetected = checkPollutionLevels(measurements);

        let status = 'normal';
        if (abnormalItems.some(item => item.level === 'danger')) {
            status = 'danger';
        } else if (pollutionDetected) {
            // 대기오염 물질 감지 시 warning으로 처리
            status = 'warning';
        } else if (abnormalItems.length > 0) {
            status = 'warning';
        }

        return {
            status,
            abnormalItems,
            measurements,
            measurementTime: apiSensor.measurementTime,
            district: apiSensor.district,
            dong: apiSensor.dong,
            pollutionDetected
        };
    }

    // API 데이터가 없는 경우
    return {
        status: 'unknown',
        abnormalItems: [],
        measurements: {},
        measurementTime: null,
        pollutionDetected: false
    };
}

// 경보 업데이트 (API 데이터 기반)
function updateAlertFromApi() {
    const alertBar = document.getElementById('alertBar');
    const alertText = document.getElementById('alertText');

    if (!apiDataCache.lastUpdate) {
        alertBar.classList.remove('danger');
        alertText.textContent = '실시간 데이터를 불러오는 중...';
        return;
    }

    // 이상 센서 찾기
    const warningSensors = [];
    const dangerSensors = [];

    Object.entries(apiDataCache.bySensor).forEach(([sensorId, sensor]) => {
        const abnormalItems = checkAbnormalItems(sensor.measurements);
        if (abnormalItems.some(item => item.level === 'danger')) {
            dangerSensors.push({ id: sensorId, district: sensor.district, items: abnormalItems });
        } else if (abnormalItems.length > 0) {
            warningSensors.push({ id: sensorId, district: sensor.district, items: abnormalItems });
        }
    });

    // 구별로 집계
    const dangerDistricts = [...new Set(dangerSensors.map(s => s.district))];
    const warningDistricts = [...new Set(warningSensors.map(s => s.district))];

    if (dangerDistricts.length > 0) {
        alertBar.classList.add('danger');
        const dangerItems = dangerSensors.flatMap(s => s.items.filter(i => i.level === 'danger'));
        const itemNames = [...new Set(dangerItems.map(i => i.name))].slice(0, 3).join(', ');
        alertText.textContent = `[긴급] ${dangerDistricts.join(', ')} 지역에서 ${itemNames} 이상 감지! 센서 ${dangerSensors.length}개 위험 상태`;
    } else if (warningDistricts.length > 0) {
        alertBar.classList.remove('danger');
        alertText.textContent = `[주의] ${warningDistricts.join(', ')} 지역 센서 ${warningSensors.length}개에서 이상값 감지`;
    } else {
        alertBar.classList.remove('danger');
        const totalSensors = Object.keys(apiDataCache.bySensor).length;
        const lastTime = apiDataCache.lastUpdate ? new Date(apiDataCache.lastUpdate).toLocaleTimeString('ko-KR') : '-';
        alertText.textContent = `서울시 전역 정상 | 활성 센서: ${totalSensors}개 | 마지막 업데이트: ${lastTime}`;
    }
}

// 대기오염 임계값 설정
const pollutionThresholds = {
    PM25: 35,      // 미세먼지 PM2.5 (㎍/㎥) - 나쁨 기준
    PM10: 80,      // 미세먼지 PM10 (㎍/㎥) - 나쁨 기준
    O3: 0.1,       // 오존 (ppm) - 나쁨 기준
    NH3: 25,       // 암모니아 (ppm) - 악취 기준
    H2S: 0.02,     // 황화수소 (ppm) - 악취 기준
    CO: 9,         // 일산화탄소 (ppm) - 나쁨 기준
    NO2: 0.06,     // 이산화질소 (ppm) - 나쁨 기준
    SO2: 0.05      // 아황산가스 (ppm) - 나쁨 기준
};

// 대기오염 감지 상태
let pollutionAlertActive = false;

// 파티클 색상을 빨간색으로 변경 (3초간)
function triggerPollutionAlert() {
    if (pollutionAlertActive) return;

    pollutionAlertActive = true;

    // 모든 파티클에 pollution-alert 클래스 추가
    d3.selectAll('.wind-particle').classed('pollution-alert', true);

    console.log('⚠️ 대기오염 물질 감지! 파티클 경고 모드 활성화');

    // 3초 후 원래 색상으로 복원
    setTimeout(() => {
        d3.selectAll('.wind-particle').classed('pollution-alert', false);
        pollutionAlertActive = false;
        console.log('✓ 파티클 경고 모드 해제');
    }, 3000);
}

// API 데이터에서 대기오염 물질 체크
function checkPollutionLevels(sensorData) {
    if (!sensorData) return false;

    // 각 오염물질 체크
    const pm25 = sensorData.PM25 || sensorData.pm25 || 0;
    const pm10 = sensorData.PM10 || sensorData.pm10 || 0;
    const o3 = sensorData.O3 || sensorData.o3 || 0;
    const nh3 = sensorData.NH3 || sensorData.nh3 || 0;
    const h2s = sensorData.H2S || sensorData.h2s || 0;
    const co = sensorData.CO || sensorData.co || 0;
    const no2 = sensorData.NO2 || sensorData.no2 || 0;
    const so2 = sensorData.SO2 || sensorData.so2 || 0;

    // 임계값 초과 체크
    if (pm25 > pollutionThresholds.PM25 ||
        pm10 > pollutionThresholds.PM10 ||
        o3 > pollutionThresholds.O3 ||
        nh3 > pollutionThresholds.NH3 ||
        h2s > pollutionThresholds.H2S ||
        co > pollutionThresholds.CO ||
        no2 > pollutionThresholds.NO2 ||
        so2 > pollutionThresholds.SO2) {
        return true;
    }

    return false;
}

// API 데이터 업데이트 시 대기오염 체크
function checkAllSensorsForPollution() {
    if (!apiDataCache.bySensor) return;

    let pollutionDetected = false;
    const pollutedSensors = [];

    // 디버깅: 처음 5개 센서의 대기오염 데이터 출력
    const sensorEntries = Object.entries(apiDataCache.bySensor);
    console.log('📊 API 대기오염 데이터 샘플 (처음 5개 센서):');
    sensorEntries.slice(0, 5).forEach(([sensorId, sensor]) => {
        console.log(`  ${sensorId}:`, {
            o3: sensor.measurements?.o3,
            nh3: sensor.measurements?.nh3,
            h2s: sensor.measurements?.h2s,
            co: sensor.measurements?.co,
            no2: sensor.measurements?.no2,
            so2: sensor.measurements?.so2
        });
    });

    sensorEntries.forEach(([sensorId, sensor]) => {
        if (sensor.measurements && checkPollutionLevels(sensor.measurements)) {
            pollutionDetected = true;
            pollutedSensors.push({
                id: sensorId,
                district: sensor.district,
                dong: sensor.dong,
                measurements: {
                    o3: sensor.measurements.o3,
                    nh3: sensor.measurements.nh3,
                    h2s: sensor.measurements.h2s,
                    co: sensor.measurements.co,
                    no2: sensor.measurements.no2,
                    so2: sensor.measurements.so2
                }
            });
        }
    });

    if (pollutionDetected) {
        console.log('🚨 대기오염 감지 센서:', pollutedSensors);
        triggerPollutionAlert();
    } else {
        console.log('✅ 대기오염 감지된 센서 없음 (임계값 미만)');
    }
}

// 테스트용: 특정 센서에 대기오염 시뮬레이션 (콘솔에서 simulatePollution() 호출)
window.simulatePollution = function() {
    const sensorEntries = Object.entries(apiDataCache.bySensor);
    if (sensorEntries.length === 0) {
        console.log('❌ API 데이터가 없습니다. 잠시 후 다시 시도하세요.');
        return;
    }

    // 처음 3개 센서에 임계값 초과 데이터 주입
    const testSensors = sensorEntries.slice(0, 3);
    testSensors.forEach(([sensorId, sensor]) => {
        sensor.measurements.o3 = 0.2;  // 임계값 0.1 초과
        sensor.measurements.no2 = 0.1; // 임계값 0.06 초과
        console.log(`🧪 테스트: ${sensorId} 센서에 대기오염 주입 (O3: 0.2, NO2: 0.1)`);
    });

    // 대기오염 체크 재실행
    checkAllSensorsForPollution();

    console.log('');
    console.log('💡 테스트 방법:');
    console.log('   1. 지도에서 위 센서를 찾아 클릭하세요');
    console.log('   2. 역추적선이 표시됩니다');
    console.log('   3. 보라색 "추정 발원지" 마커를 클릭하면 해당 구로 이동합니다');
};

console.log('💡 대기오염 테스트: 콘솔에서 simulatePollution() 입력');
