// replay.js - 리플레이 모드

// LRU 캐시 관리 헬퍼
function addToReplayCache(cacheKey, data) {
    if (replayMode.cachedKeys.length >= 48) {
        const oldKey = replayMode.cachedKeys.shift();
        delete replayMode.cachedData[oldKey];
        delete replayMode.processedCache[oldKey];
    }
    replayMode.cachedKeys.push(cacheKey);
    replayMode.cachedData[cacheKey] = data || [];
}

// 오늘 날짜 가져오기 (YYYY-MM-DD 형식)
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Replay 날짜 입력 초기화
function initReplayDateInput() {
    const dateInput = document.getElementById('replayDate');
    if (dateInput) {
        const today = getTodayDate();
        // 시작일 ~ 오늘까지만 선택 가능 (미래 날짜 불가)
        dateInput.min = replayApiConfig.dateRange.start;
        dateInput.max = today;
        dateInput.value = today; // 기본값: 오늘 날짜
        console.log('Date input initialized:', dateInput.min, '-', dateInput.max, '(today:', today, ')');
    }
}

// Replay 모드 토글
function toggleReplayMode() {
    replayMode.enabled = !replayMode.enabled;
    const toggle = document.getElementById('replayToggle');
    const content = document.getElementById('replayContent');
    const statusBadge = document.getElementById('apiStatusBadge');
    const liveIndicator = document.getElementById('liveStatusIndicator');
    const replayIndicator = document.getElementById('replayTimeIndicator');
    const replayTimeDisplay = document.getElementById('replayTimeDisplay');

    console.log('Toggle Replay Mode:', replayMode.enabled);
    console.log('Replay Indicator Element:', replayIndicator);

    if (replayMode.enabled) {
        toggle.classList.add('active');
        content.classList.add('visible');

        // 상단 표시기 전환 (실시간 → 리플레이) - 가장 먼저!
        if (liveIndicator) liveIndicator.style.display = 'none';
        if (replayIndicator) {
            replayIndicator.style.display = 'flex';
            console.log('Replay indicator shown:', replayIndicator);
        }

        // 상태 배지 변경
        if (statusBadge) {
            statusBadge.textContent = 'REPLAY';
            statusBadge.style.background = '#9b59b6';
        }

        // 날짜 범위 설정 (DB 메타데이터 기반)
        try {
            const dateInput = document.getElementById('replayDate');
            const today = getTodayDate();
            if (dateInput) {
                dateInput.min = replayApiConfig.dateRange.start;
                dateInput.max = today;
                dateInput.value = today;
                replayMode.date = today;
            }
            replayMode.hour = 12;

            // DB 메타데이터 비동기 로드 후 데이터 로드 (Race Condition 방지)
            fetchReplayMetadata().then(meta => {
                if (meta && dateInput) {
                    dateInput.min = meta.min_date;
                    if (meta.max_date < today) {
                        dateInput.max = meta.max_date;
                    }
                    console.log('Date range updated from DB:', meta.min_date, '~', dateInput.max);
                }
                // 메타데이터 로드 완료 후 데이터 로드
                loadReplayData();
            }).catch(() => {
                // 메타데이터 실패 시에도 데이터 로드 시도
                loadReplayData();
            });
        } catch (e) {
            console.error('Replay date setup error:', e);
        }

        // 초기 시간 즉시 표시
        if (replayTimeDisplay) {
            const initialTime = `${replayMode.date || getTodayDate()} ${String(replayMode.hour || 12).padStart(2, '0')}:00`;
            replayTimeDisplay.textContent = initialTime;
        }
    } else {
        toggle.classList.remove('active');
        content.classList.remove('visible');
        stopReplayPlay();

        // 상단 표시기 전환 (리플레이 → 실시간)
        if (liveIndicator) liveIndicator.style.display = 'flex';
        if (replayIndicator) {
            replayIndicator.style.display = 'none';
        }

        // 실시간 모드로 복귀
        if (statusBadge) {
            statusBadge.textContent = 'LIVE';
            statusBadge.style.background = '#2ecc71';
        }
        document.getElementById('replayStatus').textContent = '날짜를 선택하세요';

        // 실시간 데이터 다시 로드
        updateFromApi();
    }
}

// 날짜 변경 핸들러
function onReplayDateChange() {
    const dateInput = document.getElementById('replayDate');
    replayMode.date = dateInput.value;

    if (replayMode.date) {
        loadReplayData();
    }
}

// 시간 슬라이더 변경 핸들러
function onReplaySliderChange(value) {
    replayMode.hour = parseInt(value);
    const timeValue = document.getElementById('replayTimeValue');
    const replayTimeDisplay = document.getElementById('replayTimeDisplay');
    const timeStr = `${String(replayMode.hour).padStart(2, '0')}:00`;

    timeValue.textContent = timeStr;

    // 상단 navbar 시간 표시 업데이트
    if (replayTimeDisplay && replayMode.date) {
        const fullTimeStr = `${replayMode.date} ${timeStr}`;
        replayTimeDisplay.textContent = fullTimeStr;
    }

    if (replayMode.date) {
        loadReplayData();
    }
}

// 이전 시간
function replayPrevHour() {
    const slider = document.getElementById('replaySlider');
    if (replayMode.hour > 0) {
        replayMode.hour--;
        slider.value = replayMode.hour;
        onReplaySliderChange(replayMode.hour);
    } else {
        // 0시 → 전날 23시로 이동
        const dateInput = document.getElementById('replayDate');
        const currentDate = new Date(replayMode.date);
        currentDate.setDate(currentDate.getDate() - 1);
        const prevDate = currentDate.toISOString().split('T')[0];
        if (dateInput && prevDate >= dateInput.min) {
            dateInput.value = prevDate;
            replayMode.date = prevDate;
            replayMode.hour = 23;
            slider.value = 23;
            onReplaySliderChange(23);
        }
    }
}

// 다음 시간
function replayNextHour() {
    const slider = document.getElementById('replaySlider');
    if (replayMode.hour < 23) {
        replayMode.hour++;
        slider.value = replayMode.hour;
        onReplaySliderChange(replayMode.hour);
    } else {
        // 23시 → 다음날 0시로 이동
        const dateInput = document.getElementById('replayDate');
        const currentDate = new Date(replayMode.date);
        currentDate.setDate(currentDate.getDate() + 1);
        const nextDate = currentDate.toISOString().split('T')[0];
        if (dateInput && nextDate <= dateInput.max) {
            dateInput.value = nextDate;
            replayMode.date = nextDate;
            replayMode.hour = 0;
            slider.value = 0;
            onReplaySliderChange(0);
        }
    }
}

// 시간 표시 UI만 업데이트 (데이터 로드 없이)
function updateReplayTimeUI(hour) {
    const timeValue = document.getElementById('replayTimeValue');
    const replayTimeDisplay = document.getElementById('replayTimeDisplay');
    const slider = document.getElementById('replaySlider');
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    slider.value = hour;
    timeValue.textContent = timeStr;
    if (replayTimeDisplay && replayMode.date) {
        replayTimeDisplay.textContent = `${replayMode.date} ${timeStr}`;
    }
}

// 자동 재생 토글 (적응형 속도: 캐시 히트 시 300ms, 미스 시 로드 완료 즉시)
function toggleReplayPlay() {
    const playBtn = document.getElementById('replayPlayBtn');

    if (replayMode.isPlaying) {
        stopReplayPlay();
    } else {
        if (!replayMode.date) {
            alert('날짜를 먼저 선택하세요');
            return;
        }
        replayMode.isPlaying = true;
        playBtn.classList.add('active');
        playBtn.innerHTML = '⏸';

        // 적응형 재생 루프
        async function playLoop() {
            while (replayMode.isPlaying) {
                if (replayMode.hour < 23) {
                    const nextHour = replayMode.hour + 1;
                    const cacheKey = `${replayMode.date}_${nextHour}`;
                    const isCached = !!replayMode.cachedData[cacheKey];

                    // 다음 시간으로 이동 (UI만 업데이트)
                    replayMode.hour = nextHour;
                    updateReplayTimeUI(nextHour);

                    // isLoading 대기 (프리페치 진행 중일 수 있음)
                    while (replayMode.isLoading && replayMode.isPlaying) {
                        await new Promise(r => setTimeout(r, 50));
                    }
                    // 데이터 로드 (캐시 히트면 즉시, 미스면 API 대기)
                    await loadReplayData();

                    // 캐시 히트: 최소 딜레이(300ms)로 빠르게 진행
                    // 캐시 미스: 로드 완료 후 즉시 진행 (추가 대기 없음)
                    if (isCached && replayMode.isPlaying) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                } else {
                    // 23시 → 다음날 0시로 이동
                    const dateInput = document.getElementById('replayDate');
                    const currentDate = new Date(replayMode.date);
                    currentDate.setDate(currentDate.getDate() + 1);
                    const nextDate = currentDate.toISOString().split('T')[0];
                    if (dateInput && nextDate <= dateInput.max) {
                        dateInput.value = nextDate;
                        replayMode.date = nextDate;
                        replayMode.hour = 0;
                        updateReplayTimeUI(0);
                        while (replayMode.isLoading && replayMode.isPlaying) {
                            await new Promise(r => setTimeout(r, 50));
                        }
                        await loadReplayData();
                    } else {
                        // max_date 끝이면 재생 중지
                        stopReplayPlay();
                    }
                }
            }
        }
        playLoop();
    }
}

// 자동 재생 중지
function stopReplayPlay() {
    const playBtn = document.getElementById('replayPlayBtn');
    replayMode.isPlaying = false;
    playBtn.classList.remove('active');
    playBtn.innerHTML = '▶';
}

// Replay API 호출 함수 (MySQL sdot_nature_all)
async function fetchReplayFromApi(date, hour) {
    // 이전 요청 취소
    if (replayApiConfig.currentController) {
        replayApiConfig.currentController.abort();
    }
    const controller = new AbortController();
    replayApiConfig.currentController = controller;
    const timeoutId = setTimeout(() => controller.abort(), replayApiConfig.fetchTimeout);
    try {
        const url = `${REPLAY_API_BASE}/api/v1/replay?date=${date}&hour=${hour}`;
        console.log('Replay API 호출:', url);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (replayApiConfig.currentController === controller) {
            replayApiConfig.currentController = null;
        }
        console.log(`Replay API 응답: ${result.record_count}건 (actual_hour: ${result.actual_hour})`);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (replayApiConfig.currentController === controller) {
            replayApiConfig.currentController = null;
        }
        if (error.name === 'AbortError') {
            throw new Error('데이터 로드 시간 초과');
        }
        throw error;
    }
}

// Replay 메타데이터 조회 (DB 데이터 범위)
async function fetchReplayMetadata() {
    try {
        const response = await fetch(`${REPLAY_API_BASE}/api/v1/metadata`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.min_date) replayApiConfig.dateRange.start = data.min_date;
        if (data.max_date) replayApiConfig.dateRange.end = data.max_date;
        replayApiConfig.metadataLoaded = true;
        console.log('Replay 메타데이터:', data.min_date, '~', data.max_date, `(${data.total_records}건)`);
        return data;
    } catch (error) {
        console.error('메타데이터 로드 실패:', error);
        return null;
    }
}

// 과거 데이터 로드 (MySQL sdot_nature_all API)
async function loadReplayData() {
    if (!replayMode.date) return;
    if (replayMode.isLoading) return; // 중복 요청 방지

    const status = document.getElementById('replayStatus');
    const cacheKey = `${replayMode.date}_${replayMode.hour}`;

    // 이미 캐시에 있으면 바로 적용
    if (replayMode.cachedData[cacheKey]) {
        status.textContent = `${replayMode.date} 데이터 (캐시)`;
        applyReplayData();
        return;
    }

    replayMode.isLoading = true;
    status.textContent = 'DB 데이터 로딩 중...';
    status.classList.add('active');

    try {
        const result = await fetchReplayFromApi(replayMode.date, replayMode.hour);

        // LRU 캐시 관리
        addToReplayCache(cacheKey, result.data);

        const count = result.record_count || 0;
        const actualHour = result.actual_hour;
        if (actualHour !== replayMode.hour && count > 0) {
            status.textContent = `${replayMode.date} ${String(actualHour).padStart(2,'0')}:00 데이터 사용 (${count}건)`;
        } else {
            status.textContent = `${replayMode.date} 데이터 로드 완료 (${count}건)`;
        }
        applyReplayData();

        // 자동 재생 프리페치 (다음 시간)
        if (replayMode.isPlaying && replayMode.hour < 23) {
            const nextKey = `${replayMode.date}_${replayMode.hour + 1}`;
            if (!replayMode.cachedData[nextKey]) {
                fetchReplayFromApi(replayMode.date, replayMode.hour + 1).then(r => {
                    addToReplayCache(nextKey, r.data);
                }).catch(() => {});
            }
        }

    } catch (error) {
        console.error('Replay 데이터 로드 실패:', error);
        if (error.message.includes('시간 초과')) {
            status.textContent = '데이터 로드 시간 초과';
        } else {
            status.textContent = '데이터 서버에 연결할 수 없습니다';
        }
    } finally {
        replayMode.isLoading = false;
    }
}

// 리플레이 빨리감기 효과 표시
function showReplayEffect(timeStr) {
    const replayTimeDisplay = document.getElementById('replayTimeDisplay');
    const replayIndicator = document.getElementById('replayTimeIndicator');

    // 상단 navbar에 시간 표시 업데이트 + 플래시 효과
    if (replayTimeDisplay) {
        // 시간 변경 시 깜빡임 효과
        replayTimeDisplay.style.transform = 'scale(1.2)';
        replayTimeDisplay.style.color = '#ffeb3b';
        replayTimeDisplay.textContent = timeStr;

        setTimeout(() => {
            replayTimeDisplay.style.transform = 'scale(1)';
            replayTimeDisplay.style.color = '#ffffff';
        }, 200);
    }

    // 인디케이터 전체 플래시 효과 (보라색)
    if (replayIndicator) {
        replayIndicator.style.boxShadow = '0 0 30px rgba(155, 89, 182, 1)';
        setTimeout(() => {
            replayIndicator.style.boxShadow = '0 0 15px rgba(155, 89, 182, 0.6)';
        }, 300);
    }
}

// Replay 데이터 적용
function applyReplayData() {
    const cacheKey = `${replayMode.date}_${replayMode.hour}`;
    const hourData = replayMode.cachedData[cacheKey];

    // 항상 시간 표시 업데이트
    const timeStr = `${String(replayMode.hour).padStart(2, '0')}:00`;
    const fullTimeStr = `${replayMode.date} ${timeStr}`;
    showReplayEffect(fullTimeStr);

    // 상태 업데이트
    const status = document.getElementById('replayStatus');

    // 현재 날짜/시간과 비교하여 미래인지 확인
    const now = new Date();
    const replayDateTime = new Date(`${replayMode.date}T${timeStr}:00`);

    if (replayDateTime > now) {
        // 미래 시간 - 데이터 없음, 재생 중지
        stopReplayPlay();

        status.textContent = `⏳ ${replayMode.date} ${timeStr} - 미래 시간 (데이터 없음)`;

        let locationName = '서울시 전체';
        if (selectedDong && selectedDistrict) {
            locationName = `${selectedDistrict} ${selectedDong}`;
        } else if (selectedDistrict) {
            locationName = selectedDistrict;
        }

        updateInfoBox(locationName, null, {
            avgTemp: null,
            avgHum: null,
            avgNoise: null,
            sensorCount: 0
        });

        document.getElementById('currentTime').textContent =
            `${replayMode.date} ${timeStr}:00 (미래)`;
        return;
    }

    if (hourData && hourData.length > 0) {
        // 데이터 처리 및 적용
        const processedKey = `${replayMode.date}_${replayMode.hour}`;
        let processed;
        if (replayMode.processedCache[processedKey]) {
            processed = replayMode.processedCache[processedKey];
        } else {
            processed = processApiData(hourData);
            replayMode.processedCache[processedKey] = processed;
        }
        apiDataCache.byDistrict = processed.byDistrict;
        apiDataCache.bySensor = processed.bySensor;
        apiDataCache.data = hourData;

        // DB 위치정보로 sensorData 좌표 업데이트 (replay 모드)
        Object.keys(processed.bySensor).forEach(sensorId => {
            const s = processed.bySensor[sensorId];
            if (s.lat && s.lng && s.district) {
                const districtKo = s.district;
                const dongName = s.dong || '기타';
                if (sensorData[districtKo]) {
                    // 해당 구에서 센서 찾기
                    let found = false;
                    Object.keys(sensorData[districtKo]).forEach(dong => {
                        const sensors = sensorData[districtKo][dong];
                        const idx = sensors.findIndex(sen => sen.id === sensorId);
                        if (idx !== -1) {
                            sensors[idx].lat = s.lat;
                            sensors[idx].lng = s.lng;
                            found = true;
                        }
                    });
                    // 기존에 없는 센서면 동에 추가
                    if (!found) {
                        // 가장 유사한 동 이름 찾기
                        let targetDong = Object.keys(sensorData[districtKo])[0];
                        Object.keys(sensorData[districtKo]).forEach(dong => {
                            if (dongName && dongName.includes(dong.replace(/[0-9()·동]/g, ''))) {
                                targetDong = dong;
                            }
                        });
                        if (targetDong) {
                            sensorData[districtKo][targetDong].push({
                                id: sensorId, lat: s.lat, lng: s.lng
                            });
                        }
                    }
                }
            }
        });

        // 동 뷰일 때 dongData 갱신 (replay 데이터 반영)
        if (selectedDistrict && (currentView === 'dong' || currentView === 'dongZoom')) {
            // 기존 dongData 초기화
            Object.keys(dongData).forEach(key => {
                if (key.startsWith(selectedDistrict + '_')) {
                    dongData[key].temp = null;
                    dongData[key].humidity = null;
                    dongData[key].noise = null;
                    dongData[key].sensorCount = 0;
                }
            });
            // replay 센서 데이터로 dongData 채우기
            Object.values(processed.bySensor).forEach(sensor => {
                if (sensor.district === selectedDistrict) {
                    const dongKeys = Object.keys(dongData).filter(k => k.startsWith(selectedDistrict + '_'));
                    dongKeys.forEach(key => {
                        const dongName = key.replace(selectedDistrict + '_', '');
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
                        }
                    });
                }
            });
        }

        // 지도 색상 업데이트
        updateMapColorsFromApi();

        // 서울시 전체 평균 계산
        let totalTemp = 0, totalHum = 0, totalNoise = 0;
        let tempCount = 0, humCount = 0, noiseCount = 0;

        Object.values(processed.byDistrict).forEach(district => {
            if (district.avgTemp !== null && !isNaN(district.avgTemp)) {
                totalTemp += district.avgTemp;
                tempCount++;
            }
            if (district.avgHum !== null && !isNaN(district.avgHum)) {
                totalHum += district.avgHum;
                humCount++;
            }
            if (district.avgNoise !== null && !isNaN(district.avgNoise)) {
                totalNoise += district.avgNoise;
                noiseCount++;
            }
        });

        const seoulTotalData = {
            avgTemp: tempCount > 0 ? totalTemp / tempCount : null,
            avgHum: humCount > 0 ? totalHum / humCount : null,
            avgNoise: noiseCount > 0 ? totalNoise / noiseCount : null,
            sensorCount: hourData.length
        };

        // 현재 뷰에 따라 적절한 데이터 표시
        if (currentView === 'dongZoom' && selectedDong && selectedDistrict) {
            // 동 뷰: 해당 동 데이터 표시
            const dongData = hourData.filter(d =>
                (d._districtKo === selectedDistrict || d.CGG === selectedDistrict) &&
                d.DONG && d.DONG.includes(selectedDong.replace(/[0-9·동]/g, ''))
            );
            if (dongData.length > 0) {
                let dTemp = 0, dHum = 0, dNoise = 0, dCount = 0;
                dongData.forEach(d => {
                    if (d.AVG_TP) { dTemp += parseFloat(d.AVG_TP); dCount++; }
                    if (d.AVG_HUM) { dHum += parseFloat(d.AVG_HUM); }
                    if (d.AVG_NIS) { dNoise += parseFloat(d.AVG_NIS); }
                });
                updateInfoBox(`${selectedDistrict} ${selectedDong}`, null, {
                    avgTemp: dCount > 0 ? dTemp / dCount : null,
                    avgHum: dCount > 0 ? dHum / dCount : null,
                    avgNoise: dCount > 0 ? dNoise / dCount : null,
                    sensorCount: dongData.length
                });
            } else {
                updateInfoBox(`${selectedDistrict} ${selectedDong}`, null, seoulTotalData);
            }
        } else if ((currentView === 'dong' || currentView === 'dongZoom') && selectedDistrict) {
            // 구 뷰: 해당 구 데이터 표시
            const districtData = processed.byDistrict[selectedDistrict];
            if (districtData) {
                updateInfoBox(selectedDistrict, null, districtData);
            } else {
                updateInfoBox(selectedDistrict, null, seoulTotalData);
            }
        } else {
            // 서울시 전체 뷰
            updateInfoBox('서울시 전체', null, seoulTotalData);
        }

        // API 상태 배지를 REPLAY로 표시
        const badge = document.getElementById('apiStatusBadge');
        if (badge) {
            badge.style.background = '#9b59b6';
            badge.textContent = 'REPLAY';
        }

        status.textContent = `📅 ${replayMode.date} ${timeStr} (${hourData.length}개 센서)`;
        status.classList.add('active');

        // 현재 시간 표시 영역도 업데이트
        document.getElementById('currentTime').textContent =
            `${replayMode.date} ${timeStr}:00 (Replay)`;
    } else {
        // 데이터 없음
        status.textContent = `📅 ${replayMode.date} ${timeStr} - 데이터 없음`;

        // 현재 선택된 지역에 맞게 표시
        let locationName = '서울시 전체';
        if (selectedDong && selectedDistrict) {
            locationName = `${selectedDistrict} ${selectedDong}`;
        } else if (selectedDistrict) {
            locationName = selectedDistrict;
        }

        // 정보 박스 초기화
        updateInfoBox(locationName, null, {
            avgTemp: null,
            avgHum: null,
            avgNoise: null,
            sensorCount: 0
        });
    }
}

// 시간 업데이트
function updateTime() {
    // Replay 모드일 때는 시간을 업데이트하지 않음
    if (replayMode.enabled) return;

    document.getElementById('currentTime').textContent = new Date().toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
}
